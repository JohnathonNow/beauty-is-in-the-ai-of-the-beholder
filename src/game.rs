use super::packets;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc};
use async_mutex::Mutex;
use tokio::sync::broadcast;
use warp::ws::{Message, WebSocket};
use std::fs::File;
use std::io::{Write, BufWriter};
use base64::Engine;
use std::fs;
use uuid::Uuid;
use rand::thread_rng;
use rand::seq::SliceRandom;
use log::{info, error};

pub type GameServerState = Arc<Mutex<State>>;
type PeerMap = HashMap<String, broadcast::Sender<String>>;

const MAX_NAME_LENGTH: usize = 24;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Word {
    pub word: String,
    pub embedding: Vec<f32>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Vector {
    pub inner: Vec<f32>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Options {
    pub offset: Vec<f32>,
    pub blank: Vec<f32>,
}

pub struct State {
    pub peer_map: PeerMap,
    sendable: SendableState,
    word_pool: Vec<Word>,
    embedding: Vec<f32>,
    offset_embedding: Vec<f32>,
    blank_embedding: Vec<f32>,
    banned_players: std::collections::HashSet<String>,
}

impl State {
    pub fn new(timelimit: i32, maxpoints: i32, end_on_time: bool, gametype: String) -> Self {

        //TODO: improve this?
        let config: Options = serde_json::from_str::<Options>(&fs::read_to_string("./resources/offsets.json").unwrap()).unwrap();

        Self {
            peer_map: HashMap::new(),
            sendable: SendableState::new("".into(), timelimit, maxpoints, end_on_time, gametype),
            word_pool: Vec::new(),
            embedding: vec![],
            offset_embedding: config.offset,
            blank_embedding: config.blank,
            banned_players: std::collections::HashSet::new(),
        }
    }
    fn broadcast_state(&self) {
        self.broadcast(
            serde_json::to_string(&packets::Outgoing::FullState {
                state: &self.sendable,
            })
            .unwrap(),
        );
    }
    fn broadcast(&self, message: String) {
        for (_, tx) in self.peer_map.iter() {
            tx.send(message.clone()).unwrap_or(0);
        }
    }
    async fn score(&self, file: &str) -> Result<f32, ()> {
		let request_url = format!("http://localhost:9991/?path={}", file);
		let client = reqwest::Client::new();
		let response = client
			.get(request_url)
			.send().await;
                let response = if let Ok(x) = response { x } else { return Err(()); };
                let response = if let Ok(x) = response.json::<Vector>().await { x} else { return Err(()); };

        return Ok(response.inner
                .iter()
                .zip(self.offset_embedding.iter())
                .map(|(&x1, &x2)| x1 - x2)
                .zip(self.embedding.iter())
                .map(|(x1, &x2)| (x1 - x2).powi(2))
                .sum())
        //f32::INFINITY
    }
    fn restart(&mut self) {
        if let Some(word) = self.word_pool.pop() {
            self.sendable.word = word.word;
            self.embedding = word.embedding;
        }
        self.sendable.bad_score = self.blank_embedding
            .iter()
            .zip(self.offset_embedding.iter())
            .map(|(&x1, &x2)| x1 - x2)
            .zip(self.embedding.iter())
            .map(|(x1, &x2)| (x1 - x2).powi(2))
            .sum();
        self.sendable.restart();
    }
    pub fn add_words(&mut self, words: Vec<Word>) {
        self.word_pool.extend(words);
        self.restart();
    }
    pub fn tick(&mut self) {
        match self.sendable.get_state() {
            GameState::LOBBY => {}
            GameState::RUNNING => {
                self.sendable.tick_running();
                let mut should_end = self.sendable.is_over();

                if self.sendable.gametype == "Classic" {
                    let mut active_count = 0;
                    let mut guessed_count = 0;
                    for (name, player) in self.sendable.players.iter() {
                        if player.active && Some(name.clone()) != self.sendable.drawer {
                            active_count += 1;
                            if player.has_guessed {
                                guessed_count += 1;
                            }
                        }
                    }
                    if active_count > 0 && guessed_count == active_count {
                        should_end = true;
                    }

                    if should_end {
                        if let Some(drawer_name) = &self.sendable.drawer {
                            if let Some(drawer) = self.sendable.players.get_mut(drawer_name) {
                                let ratio = if active_count > 0 {
                                    guessed_count as f32 / active_count as f32
                                } else {
                                    0.0
                                };
                                let points = -10.0 + 50.0 * ratio;
                                drawer.score += points.max(-10.0).min(40.0);
                            }
                        }
                    }
                }

                if should_end {
                    let mut start_new_turn = false;
                    if self.sendable.gametype == "Classic" {
                        let undrawn_players: Vec<String> = self.sendable.players.iter()
                            .filter_map(|(name, p)| if p.active && !p.has_drawn { Some(name.clone()) } else { None })
                            .collect();
                        if !undrawn_players.is_empty() {
                            start_new_turn = true;
                            self.sendable.time = 0;
                            for (_, p) in self.sendable.players.iter_mut() {
                                p.has_guessed = false;
                                p.image_path = None;
                            }
                            let mut rng = thread_rng();
                            if let Some(new_drawer) = undrawn_players.choose(&mut rng) {
                                self.sendable.drawer = Some(new_drawer.clone());
                                if let Some(player) = self.sendable.players.get_mut(new_drawer) {
                                    player.has_drawn = true;
                                }
                            }
                            if let Some(word) = self.word_pool.pop() {
                                self.sendable.word = word.word;
                                self.embedding = word.embedding;
                            }
                        }
                    }

                    if start_new_turn {
                        self.broadcast_state();
                    } else {
                        self.sendable.set_state(GameState::POSTGAME);
                        self.broadcast_state();
                    }
                }
            }
            GameState::POSTGAME => {}
        }
    }
}

pub async fn handle(
    ws: WebSocket,
    game_state: GameServerState,
    gtx: broadcast::Sender<String>,
    _lobby_name: String,
    login_name_pre: String,
) {
    let login_name = truncate(&login_name_pre, MAX_NAME_LENGTH).to_string();
    let (tx, mut _rx) = broadcast::channel::<String>(100);
    let (mut user_ws_tx, mut user_ws_rx) = ws.split();
    let mut die = false;
    {
        let gs = game_state.lock().await;
        if gs.banned_players.contains(&login_name) {
            let _ = user_ws_tx.send(Message::text(serde_json::to_string(&packets::Outgoing::Banned {}).unwrap())).await;
            return;
        }
    }
    {
        let mut gs = game_state.lock().await;
        gs.sendable.set_host(&login_name);
        let pm: &mut PlayerState = gs.sendable.get_player_mut(&login_name);
        if pm.is_active() {
            die = true;
        } else {
            gs.peer_map.insert(login_name.clone(), tx.clone());
        }
    }

    if die {
        let _ = user_ws_tx.send(Message::text(
            serde_json::to_string(&packets::Outgoing::NewName {
                new_name: login_name.clone(),
            })
            .unwrap(),
        )).await;
        return;
    }

    tokio::task::spawn(async move {
        {
            let mut gs = game_state.lock().await;
            let pm: &mut PlayerState = gs.sendable.get_player_mut(&login_name);
            pm.set_active(true);
        }
        let _ = gtx.send(
            serde_json::to_string(&packets::Outgoing::FullState {
                state: &game_state.lock().await.sendable,
            })
            .unwrap(),
        );

        while let Some(result) = user_ws_rx.next().await {
            let message = match result {
                Ok(msg) => msg,
                Err(e) => {
                    error!("WebSocket error: {}", e);
                    break;
                }
            };

            let message = if let Ok(text) = message.to_str() {
                text.to_owned()
            } else {
                continue;
            };

            info!("{}: {}", &login_name, message);
            if let Ok(packet) = serde_json::from_str::<packets::Incoming>(&message) {
                match packet {
                    packets::Incoming::Start {} => {
                        let mut gs = game_state.lock().await;
                        if let Some(host) = gs.sendable.get_host() {
                            if host == &login_name {
                                gs.sendable.set_state(GameState::RUNNING);
                                if gs.sendable.gametype == "Classic" {
                                    let active_players: Vec<String> = gs.sendable.players.iter()
                                        .filter_map(|(name, p)| if p.active { Some(name.clone()) } else { None })
                                        .collect();
                                    if !active_players.is_empty() {
                                        let mut rng = thread_rng();
                                        if let Some(drawer) = active_players.choose(&mut rng) {
                                            gs.sendable.drawer = Some(drawer.clone());
                                            if let Some(player_state) = gs.sendable.players.get_mut(drawer) {
                                                player_state.has_drawn = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        let _ = gtx.send(
                            serde_json::to_string(&packets::Outgoing::FullState {
                                state: &gs.sendable,
                            })
                            .unwrap(),
                        );
                    }
                    packets::Incoming::Kick { player } => {
                        let mut gs = game_state.lock().await;
                        if let Some(host) = gs.sendable.get_host() {
                            if host == &login_name && host != &player {
                                if let Some(p) = gs.peer_map.get(&player) {
                                    let _ = p.send(serde_json::to_string(&packets::Outgoing::Kicked {}).unwrap());
                                }
                                gs.peer_map.remove(&player);
                                if let Some(p_state) = gs.sendable.players.get_mut(&player) {
                                    p_state.active = false;
                                }
                                let _ = gtx.send(
                                    serde_json::to_string(&packets::Outgoing::FullState {
                                        state: &gs.sendable,
                                    })
                                    .unwrap(),
                                );
                            }
                        }
                    }
                    packets::Incoming::Ban { player } => {
                        let mut gs = game_state.lock().await;
                        if let Some(host) = gs.sendable.get_host() {
                            if host == &login_name && host != &player {
                                gs.banned_players.insert(player.clone());
                                if let Some(p) = gs.peer_map.get(&player) {
                                    let _ = p.send(serde_json::to_string(&packets::Outgoing::Banned {}).unwrap());
                                }
                                gs.peer_map.remove(&player);
                                if let Some(p_state) = gs.sendable.players.get_mut(&player) {
                                    p_state.active = false;
                                }
                                let _ = gtx.send(
                                    serde_json::to_string(&packets::Outgoing::FullState {
                                        state: &gs.sendable,
                                    })
                                    .unwrap(),
                                );
                            }
                        }
                    }
                    packets::Incoming::Restart {} => {
                        let mut gs = game_state.lock().await;
                        if let Some(host) = gs.sendable.get_host() {
                            if host == &login_name {
                                gs.restart();
                            }
                        }
                        let _ = gtx.send(
                            serde_json::to_string(&packets::Outgoing::FullState {
                                state: &gs.sendable,
                            })
                            .unwrap(),
                        );
                    }
                    packets::Incoming::Guess { guess } => {
                        let mut gs = game_state.lock().await;
                        let mut is_correct = false;
                        let mut guess_points = 0;
                        let mut the_drawer = String::new();

                        if gs.sendable.gametype == "Classic" && gs.sendable.get_state() as u8 == GameState::RUNNING as u8 {
                            if guess.to_lowercase() == gs.sendable.word.to_lowercase() {
                                let drawer_clone = gs.sendable.drawer.clone();
                                if let Some(d) = drawer_clone {
                                    if d != login_name {
                                        if let Some(player) = gs.sendable.players.get_mut(&login_name) {
                                            if !player.has_guessed {
                                                is_correct = true;
                                                player.has_guessed = true;
                                                the_drawer = d;
                                            }
                                        }
                                        if is_correct {
                                            // Compute points
                                            let mut first_guess = true;
                                            for (n, p) in &gs.sendable.players {
                                                if *n != login_name && p.has_guessed {
                                                    first_guess = false;
                                                }
                                            }
                                            if first_guess {
                                                guess_points = 50;
                                            } else {
                                                let remaining = gs.sendable.timelimit - gs.sendable.time;
                                                guess_points = (remaining as f32 / gs.sendable.timelimit as f32 * 50.0) as i32;
                                            }

                                            if let Some(player) = gs.sendable.players.get_mut(&login_name) {
                                                player.score += guess_points as f32;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        if is_correct {
                            let _ = gtx.send(
                                serde_json::to_string(&packets::Outgoing::Guessed {
                                    guesser: login_name.clone(),
                                    drawer: the_drawer,
                                    points: guess_points,
                                })
                                .unwrap()
                            );

                            if let Some(player) = gs.sendable.players.get(&login_name) {
                                let _ = gtx.send(
                                    serde_json::to_string(&packets::Outgoing::Score {
                                        username: login_name.clone(),
                                        score: player.score,
                                    })
                                    .unwrap()
                                );
                            }
                        } else {
                            let _ = gtx.send(
                                serde_json::to_string(&packets::Outgoing::Guess {
                                    username: login_name.clone(),
                                    guess,
                                })
                                .unwrap(),
                            );
                        }
                    }
                    packets::Incoming::Image { image } => {
                        let mut gs = game_state.lock().await;

                        if gs.sendable.gametype == "Classic" {
                            if let Some(drawer) = &gs.sendable.drawer {
                                if *drawer != login_name {
                                    continue; // Only the drawer can submit images in Classic mode
                                }
                            } else {
                                continue;
                            }
                        }

                        let uuid = Uuid::new_v4().to_string();
                        let dir_prefix = &uuid[..4];
                        let dir_path = format!("frontend/drawings/{}", dir_prefix);
                        let _ = fs::create_dir_all(&dir_path);
                        let file_path = format!("{}/{}.png", dir_path, uuid);

                        let _ = save_png_from_data_url(&image, &file_path);
                        info!("Saved image to {}", file_path);

                        let mut final_score = 0.0;

                        if gs.sendable.gametype != "Classic" {
                            let score = gs.score(&file_path).await.unwrap_or(0f32);
                            info!("Wow, score is {}", score);
                            final_score = 160.0 - score;
                        }

                        let is_classic = gs.sendable.gametype == "Classic";
                        let player = gs.sendable.get_player_mut(&login_name);
                        if !is_classic {
                            player.score = final_score;
                        }
                        player.image_path = Some(format!("drawings/{}/{}.png", dir_prefix, uuid));

                        if !is_classic {
                            let _ = gtx.send(
                                serde_json::to_string(&packets::Outgoing::Score {
                                    username: login_name.clone(),
                                    score: final_score,
                                })
                                .unwrap(),
                            );
                        }
                        gs.broadcast_state();
                    }
                }
            }
        }

        let mut x = game_state.lock().await;
        x.peer_map.remove(&login_name);
        x.sendable.get_player_mut(&login_name).set_active(false);
        x.sendable.fix_host();
        let _ = gtx.send(
            serde_json::to_string(&packets::Outgoing::FullState { state: &x.sendable }).unwrap(),
        );
    });

    while let Ok(msg) = _rx.recv().await {
        let _ = user_ws_tx.send(Message::text(msg)).await;
    }
}

#[derive(Serialize, Debug, Clone, Copy)]
pub enum GameState {
    LOBBY,
    RUNNING,
    POSTGAME,
}

#[derive(Serialize, Debug)]
pub struct SendableState {
    players: HashMap<String, PlayerState>,
    state: GameState,
    word: String,
    host: Option<String>,
    time: i32,
    timelimit: i32,
    maxpoints: i32,
    end_on_time: bool,
    bad_score: f32,
    gametype: String,
    drawer: Option<String>,
}

impl SendableState {
    pub fn new(word: String, timelimit: i32, maxpoints: i32, end_on_time: bool, gametype: String) -> Self {
        Self {
            players: HashMap::new(),
            state: GameState::LOBBY,
            word,
            host: None,
            time: 0,
            timelimit,
            maxpoints,
            end_on_time,
            bad_score: 1000.0,
            gametype,
            drawer: None,
        }
    }
    pub fn fix_host(&mut self) {
        let mut last = None;
        for (name, p) in self.players.iter_mut() {
            if p.active {
                last = Some(name.clone());
            }
        }
        if let Some(name) = last {
            self.set_host(&name);
        }
    }
    pub fn restart(&mut self) {
        self.set_state(GameState::LOBBY);
        self.time = 0;
        self.players.retain(|_name, player| player.active);
        for (_name, p) in self.players.iter_mut() {
            p.restart();
        }
        self.fix_host();
    }
    pub fn get_host(&self) -> Option<&String> {
        self.host.as_ref().map(|x| x)
    }
    pub fn set_host(&mut self, new_host: &str) {
        if let Some(p) = &self.host {
            if !self.players.get(p).unwrap().active {
                self.host = Some(new_host.to_string());
            }
        }
        else {
            self.host = Some(new_host.to_string());
        }
    }
    pub fn get_player_mut(&mut self, name: &String) -> &mut PlayerState {
        if let None = self.players.get_mut(name) {
            self.players.insert(name.clone(), PlayerState::new());
        }
        self.players.get_mut(name).unwrap()
    }
    pub fn tick_running(&mut self) {
        self.time += 1;
    }
    pub fn is_over(&self) -> bool {
        self.end_on_time && self.time > self.timelimit
    }
    pub fn set_state(&mut self, new_state: GameState) {
        self.state = new_state;
    }
    pub fn get_state(&self) -> GameState {
        self.state
    }
    pub fn wordname(&self) -> String {
        self.word.replace(" ", "-")
    }
}

#[derive(Serialize, Debug)]
pub struct PlayerState {
    pub active: bool,
    pub score: f32,
    pub image_path: Option<String>,
    pub has_guessed: bool,
    pub has_drawn: bool,
}

impl PlayerState {
    pub fn new() -> Self {
        Self {
            active: false,
            score: 0.0,
            image_path: None,
            has_guessed: false,
            has_drawn: false,
        }
    }
    pub fn restart(&mut self) {
        self.score = 0.0;
        self.image_path = None;
        self.has_guessed = false;
        self.has_drawn = false;
    }
    pub fn set_active(&mut self, active: bool) {
        self.active = active
    }
    pub fn is_active(&self) -> bool {
        self.active
    }
}

fn truncate(s: &str, max_chars: usize) -> &str {
    match s.char_indices().nth(max_chars) {
        None => s,
        Some((idx, _)) => &s[..idx],
    }
}


fn save_png_from_data_url(data_url: &str, output_path: &str) -> std::io::Result<()> {
    // Step 1: Extract the base64-encoded part (strip off the data URL prefix)
    let base64_data = if let Some(comma_pos) = data_url.find(",") {
        &data_url[comma_pos + 1..]
    } else {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid data URL"));
    };

    // Step 2: Decode the base64 string
    let decoded_data = base64::prelude::BASE64_STANDARD.decode(base64_data).map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "Failed to decode base64 data")
    })?;

    // Step 3: Write the decoded bytes to a PNG file
    let file = File::create(output_path)?;
    let mut writer = BufWriter::new(file);
    writer.write_all(&decoded_data)?;
    Ok(())
}


