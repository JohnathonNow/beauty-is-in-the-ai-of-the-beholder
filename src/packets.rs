use serde::{Deserialize, Serialize};

use crate::game;
#[derive(Serialize, Deserialize, Debug)]
pub enum Incoming {
    Guess { guess: String },
    Image { image: String },
    Start {},
    Restart {},
    Kick { player: String },
    Ban { player: String },
}

#[derive(Serialize, Debug)]
pub enum Outgoing<'a> {
    Guess {
        username: String,
        guess: String,
    },
    FullState {
        state: &'a game::SendableState,
    },
    Guessed {
        guesser: String,
        drawer: String,
        points: i32,
    },
    NewName {
        new_name: String,
    },
    Score {
        username: String,
        score: f32,
    },
    Kicked {},
    Banned {},
}
