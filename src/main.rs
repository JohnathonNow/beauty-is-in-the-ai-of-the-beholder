use serde::Deserialize;
use std::error::Error;
use std::sync::{Arc};
use async_mutex::Mutex;
use std::fs;
use std::time::Duration;
use tokio::sync::broadcast;
use tokio::{task, time};
use warp::Filter;
use clap::Parser;
use rand::thread_rng;
use rand::seq::SliceRandom;

mod packets;
mod game;
mod args;

use std::collections::HashMap;

#[derive(Deserialize)]
struct Query {
    lobby: String,
    name: String,
}

struct Lobby {
    state: game::GameServerState,
    tx: broadcast::Sender<String>,
}

type LobbyManager = Arc<Mutex<HashMap<String, Lobby>>>;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let cliargs = args::Args::parse();
    let base_words = read_words(&cliargs.words)?;

    let lobby_manager: LobbyManager = Arc::new(Mutex::new(HashMap::new()));

    // Create the default lobby
    {
        let mut inner_game_state = game::State::new(cliargs.timelimit, cliargs.maxpoints, cliargs.endontime);
        inner_game_state.add_words(base_words.clone());
        let game_state: game::GameServerState = Arc::new(Mutex::new(inner_game_state));
        let (tx, mut _rx) = broadcast::channel::<String>(100);

        let game_clone = game_state.clone();
        task::spawn(async move {
            while let Ok(msg) = _rx.recv().await {
                for (_, sender) in game_clone.lock().await.peer_map.iter() {
                    let _ = sender.send(msg.clone());
                }
            }
        });

        lobby_manager.lock().await.insert("default".to_string(), Lobby {
            state: game_state,
            tx,
        });
    }

    let lobby_manager_clone = lobby_manager.clone();
    let forever = task::spawn(async move {
        let mut interval = time::interval(Duration::from_millis(1000));

        loop {
            interval.tick().await;
            let lobbies = lobby_manager_clone.lock().await;
            for (_, lobby) in lobbies.iter() {
                lobby.state.lock().await.tick();
            }
        }
    });

    let lobby_manager_ws = lobby_manager.clone();
    let base_words_ws = base_words.clone();

    let ws_route = warp::path("chat")
        .and(warp::query::<Query>())
        .and(warp::ws())
        .and(warp::any().map(move || lobby_manager_ws.clone()))
        .and(warp::any().map(move || base_words_ws.clone()))
        .and(warp::any().map(move || cliargs.timelimit))
        .and(warp::any().map(move || cliargs.maxpoints))
        .and(warp::any().map(move || cliargs.endontime))
        .then(|query: Query, ws: warp::ws::Ws, lm: LobbyManager, bw: Vec<game::Word>, tl: i32, mp: i32, eot: bool| async move {
            let (state, tx) = {
                let mut lobbies = lm.lock().await;
                if let Some(lobby) = lobbies.get(&query.lobby) {
                    (lobby.state.clone(), lobby.tx.clone())
                } else {
                    let mut inner_game_state = game::State::new(tl, mp, eot);
                    inner_game_state.add_words(bw);
                    let game_state: game::GameServerState = Arc::new(Mutex::new(inner_game_state));
                    let (tx, mut _rx) = broadcast::channel::<String>(100);

                    let game_clone = game_state.clone();
                    task::spawn(async move {
                        while let Ok(msg) = _rx.recv().await {
                            for (_, sender) in game_clone.lock().await.peer_map.iter() {
                                let _ = sender.send(msg.clone());
                            }
                        }
                    });

                    lobbies.insert(query.lobby.clone(), Lobby {
                        state: game_state.clone(),
                        tx: tx.clone(),
                    });

                    (game_state, tx)
                }
            };

            ws.on_upgrade(move |socket| game::handle(socket, state, tx, query.lobby, query.name))
        });

    let lobby_manager_api = lobby_manager.clone();
    let lobbies_api = warp::path("lobbies")
        .and(warp::get())
        .and(warp::any().map(move || lobby_manager_api.clone()))
        .then(|lm: LobbyManager| async move {
            let lobbies = lm.lock().await;
            let keys: Vec<String> = lobbies.keys().cloned().collect();
            warp::reply::json(&keys)
        });

    let static_files = warp::fs::dir("frontend");
    let routes = ws_route.or(lobbies_api).or(static_files);

    let server = task::spawn(async move {warp::serve(routes).run(([0, 0, 0, 0], cliargs.port)).await;});

    (forever.await?, server.await?);

    Ok(())
}


fn read_words(path: &str) -> Result<Vec<game::Word>, Box<dyn Error>> {
    let mut words: Vec<game::Word> = serde_json::from_str::<Vec<game::Word>>(&fs::read_to_string(path)?)?;
    words.shuffle(&mut thread_rng());
    Ok(words)
}

#[test]
fn test_read_words() -> Result<(), Box<dyn Error>> {
    use std::path::PathBuf;
    let mut d = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    d.push("resources/wordstxtembeddings.json");
    let words = read_words(d.to_str().unwrap())?;
    assert!(words.len() > 1000);
    assert!(words.iter().any(|w| w.word.starts_with('A')));
    assert!(!words[0].word.contains('\n'));
    assert!(words.iter().any(|w| w.word.starts_with('Z')));
    Ok(())
}
