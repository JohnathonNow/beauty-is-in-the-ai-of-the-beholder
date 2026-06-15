use serde::{Deserialize, Serialize};

use crate::game;
#[derive(Serialize, Deserialize, Debug)]
pub enum Incoming {
    Guess { guess: String },
    Image { image: String },
    Start {},
    Restart {},
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
}
