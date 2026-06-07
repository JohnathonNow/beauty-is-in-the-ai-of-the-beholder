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
use futures::{StreamExt, SinkExt};
use warp::ws::Message;

mod packets;
mod game;
mod args;

use std::collections::HashMap;

#[derive(Deserialize)]
struct Query {
    lobby: String,
    name: String,
    words: Option<String>,
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

    let (global_tx, _) = broadcast::channel::<String>(100);

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

                    let mut final_words = bw;
                    if let Some(custom_words_str) = &query.words {
                        if !custom_words_str.trim().is_empty() {
                            let words_list: Vec<&str> = custom_words_str.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                            let mut fetched_words = Vec::new();
                            let client = reqwest::Client::new();
                            for w in words_list {
                                let request_url = "http://localhost:9991/text";
                                let query_text = format!("an electronic doodle depicting {}", w);
                                if let Ok(response) = client.get(request_url).query(&[("text", &query_text)]).send().await {
                                    if let Ok(vector) = response.json::<game::Vector>().await {
                                        fetched_words.push(game::Word {
                                            word: w.to_string(),
                                            embedding: vector.inner,
                                        });
                                    }
                                }
                            }
                            if !fetched_words.is_empty() {
                                fetched_words.shuffle(&mut thread_rng());
                                final_words = fetched_words;
                            }
                        }
                    }
                    inner_game_state.add_words(final_words);

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

    #[derive(Deserialize)]
    struct GlobalChatQuery {
        name: String,
    }

    let global_tx_filter = global_tx.clone();
    let global_chat_route = warp::path("global_chat")
        .and(warp::query::<GlobalChatQuery>())
        .and(warp::ws())
        .and(warp::any().map(move || global_tx_filter.clone()))
        .then(|query: GlobalChatQuery, ws: warp::ws::Ws, tx: broadcast::Sender<String>| async move {
            ws.on_upgrade(move |socket| async move {
                let (mut ws_tx, mut ws_rx) = socket.split();
                let mut rx = tx.subscribe();

                // Forward messages from the broadcast channel to the websocket
                let tx_task_sender = tx.clone();
                let name_clone = query.name.clone();

                tokio::spawn(async move {
                    while let Ok(msg) = rx.recv().await {
                        if let Err(_) = ws_tx.send(Message::text(msg)).await {
                            break;
                        }
                    }
                });

                // Forward messages from the websocket to the broadcast channel
                tokio::spawn(async move {
                    while let Some(result) = ws_rx.next().await {
                        if let Ok(msg) = result {
                            if let Ok(text) = msg.to_str() {
                                let formatted_msg = format!("{}: {}", name_clone, text);
                                let _ = tx_task_sender.send(formatted_msg);
                            }
                        } else {
                            break;
                        }
                    }
                });
            })
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
    let routes = ws_route.or(global_chat_route).or(lobbies_api).or(static_files);

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
