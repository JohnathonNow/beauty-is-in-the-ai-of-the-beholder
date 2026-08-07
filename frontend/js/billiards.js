const MAX_CHAT = 30;

var gName = null;
var socket = null;
var gMap = new Map();
var gStrokes = null;
var gMapLobby = null;
var gAssign = null;
var gState = null;
var gLastDrawer = null;
var lastStroke = 0;
var gUndo = null; // function
var gstrks = null;
var repull = true;
var gameover = false;
var gImgMap = new Map();
var gMyGuessers = null;
var gMyGuesses = null;
var lastJudged = null;
var gLobby = null;
var globalChatSocket = null;

function getBasePath() {
    let path = window.location.pathname;
    if (!path.endsWith('/')) {
        path += '/';
    }
    return path;
}

function reset() {
    gStrokes = new Map();
    gMapLobby = new Map();
    gMyGuessers = new Map();
    gMyGuesses = new Map();
    gAssign = null;
    gState = null;
    lastStroke = 0;
    gstrks = null;
    repull = false;
    gameover = false;
    document.getElementById("user-list-3").innerHTML = "";
    document.getElementById("user-list-2").innerHTML = "";
    document.getElementById("user-list-1").innerHTML = "";
    gMap.set(gName, document.getElementById("canvas"));
    clear_canvas();
}

function setupInputValidation(inputId, buttonId) {
    const input = document.getElementById(inputId);
    const button = document.getElementById(buttonId);
    if (!input || !button) return;

    const updateButtonState = () => {
        button.disabled = input.value.trim() === "";
        if (button.disabled) {
            button.setAttribute("title", "Input required to enable this button");
        } else {
            button.removeAttribute("title");
        }
    };

    updateButtonState();
    input.addEventListener("input", updateButtonState);
}

function onload_billiards() {
    function connect(customWords, timeLimit, gametype) {
        reset();
        let wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
        let wsPort = window.location.port ? ':' + window.location.port : '';
        let wsUrl = wsProtocol + window.location.hostname + wsPort + getBasePath() + 'chat?name=' + encodeURIComponent(gName) + "&lobby=" + encodeURIComponent(gLobby);
        if (customWords && customWords.length > 0) {
            wsUrl += "&words=" + encodeURIComponent(customWords);
        }
        if (timeLimit) {
            let parsedTime = parseInt(timeLimit);
            if (!isNaN(parsedTime)) {
                let clampedTime = Math.max(30, Math.min(300, parsedTime));
                wsUrl += "&time=" + clampedTime;
            }
        }
        if (gametype) {
            wsUrl += "&gametype=" + encodeURIComponent(gametype);
        }
        socket = new WebSocket(wsUrl);
        //socket = new WebSocket('ws://' + window.location.hostname + ':3030/chat');
        console.log(socket)
        // Event listener for when the WebSocket connection is established
        socket.addEventListener('open', event => {
            repull = true;
            socket.send(JSON.stringify({ "Pull": { "username": gName, i: 0 } }));
        });

        // Event listener for incoming messages from the server
        socket.addEventListener('message', event => {
            const message = event.data;
            console.log(message);
            let data = JSON.parse(message);
            if (data["Reset"]) {
                reset();
            } else if (data["Error"]) {
                alert(data["Error"]["message"]);
            } else if (data["NewName"]) {
                alert("Name " + gName + " is taken! Try again!");
                location.reload();
            } else if (data["Guessed"]) {
                let chat = document.getElementById('answers');
                let line = document.createElement("div");
                let msg = document.createElement("b");
                msg.classList = "warn";
                msg.textContent = data["Guessed"]["guesser"] + " guessed " + data["Guessed"]["drawer"] + "'s word for " + data["Guessed"]["points"] + " points!";
                line.append(msg, document.createElement("br"));
                chat.append(line);
                if (data["Guessed"]["guesser"] == gName) {
                    add_guessed(data["Guessed"]["drawer"]);
                }
                if (data["Guessed"]["drawer"] == gName) {
                    add_guesser(data["Guessed"]["guesser"]);
                }
                while (chat.children.length > MAX_CHAT) {
                    chat.removeChild(chat.children[0]);
                }
                chat.scrollTop = chat.scrollHeight;
            } else if (data["Score"] && data["Score"]["username"] == gName) {
                    document.getElementById("score").textContent = data["Score"]["score"] || "Click Judge to see score!";
            } else if (data["Guess"]) {
                let chat = document.getElementById('answers');
                let line = document.createElement("div");
                if (data["Guess"]["username"] === "") {
                    let msg = document.createElement("b");
                    msg.classList = "warn";
                    msg.textContent = data["Guess"]["guess"];
                    line.append(msg, document.createElement("br"));
                } else {
                    let user = document.createElement("b");
                    user.textContent = data["Guess"]["username"] + ": ";
                    line.append(user, data["Guess"]["guess"], document.createElement("br"));
                }
                chat.append(line);
                while (chat.children.length > MAX_CHAT) {
                    chat.removeChild(chat.children[0]);
                }
                chat.scrollTop = chat.scrollHeight;
            } else if (data["Image"]) {
                add_drawing(data["Image"]["username"], data["Image"]["image"])
                if (data["Image"]["username"] != gName && data["Image"]["i"] < gStrokes.get(data["Image"]["username"]).length) {
                    socket.send(JSON.stringify({ "Pull": { "username": data["Image"]["username"], i: gStrokes.get(data["Image"]["username"]).length } }));
                }
                if (data["Image"]["username"] == gName && repull) {
                    //load_drawing(data["Image"]["image"]);
                    repull = false;
                    redraw();
                }
            } else if (data["Undo"]) {
                undo_other(data["Undo"]["username"]);
            } else if (data["Assign"]) {
                gAssign = data["Assign"]["assignment"];
                document.getElementById("word").textContent = "Your word is " + gAssign;
            } else if (data["FullState"]) {
                if (gameover && data["FullState"]["state"]["state"] == "LOBBY") {
                    console.log("NUKED!");
                    reset();
                }

                if (data["FullState"]["state"]["gametype"] == "Story" && data["FullState"]["state"]["players"][gName] && data["FullState"]["state"]["players"][gName]["word"]) {
                    gAssign = data["FullState"]["state"]["players"][gName]["word"];
                } else {
                    gAssign = data["FullState"]["state"]["word"];
                }

                if ((data["FullState"]["state"]["gametype"] == "Classic" || data["FullState"]["state"]["gametype"] == "Evolution") && data["FullState"]["state"]["drawer"] !== gName) {
                    document.getElementById("word").textContent = "Guess the word!";
                } else {
                    document.getElementById("word").textContent = "Please draw: " + gAssign;
                }
                let namelist = get_namelist(data["FullState"]["state"]);
                for (var p in data["FullState"]["state"]["players"]) {
                    let player = data["FullState"]["state"]["players"][p];
                    let nametag = add_player(p);
                    if (data["FullState"]["state"]["host"] !== gName) {
                        if (nametag.querySelector(".kick-btn")) {
                            nametag.querySelector(".kick-btn").style.display = "none";
                            nametag.querySelector(".ban-btn").style.display = "none";
                        }
                    }
                    nametag.setAttribute("active", player["active"]);
                    if (!gameover) {
                        namelist.append(nametag);
                    }
                    if (p == gName) {
                        nametag.setAttribute("me", true);
                        if (player["score"]) {
                            document.getElementById("score").textContent = player["score"];
                        }
                    }
                    for (var guesser in player["guess_list"]) {
                        if (p == gName) {
                            add_guesser(guesser);
                        } else if (guesser == gName) {
                            add_guessed(p);
                        }
                    }
                    add_drawing(p, []);
                }

                if ((data["FullState"]["state"]["gametype"] == "Classic" || data["FullState"]["state"]["gametype"] == "Evolution") && data["FullState"]["state"]["drawer"] !== gName && data["FullState"]["state"]["drawer"] !== null) {
                    let drawerName = data["FullState"]["state"]["drawer"];
                    if (data["FullState"]["state"]["players"][drawerName] && data["FullState"]["state"]["players"][drawerName]["image_path"]) {
                        let path = getBasePath() + data["FullState"]["state"]["players"][drawerName]["image_path"];
                        if (gImgMap.get(drawerName) !== path) {
                            gImgMap.set(drawerName, path);
                            let img = new Image();
                            img.onload = function() {
                                let ctx = document.getElementById("canvas").getContext("2d");
                                ctx.clearRect(0, 0, 1000, 1000);
                                ctx.drawImage(img, 0, 0, 1000, 1000);
                            };
                            img.src = path;
                        }
                    }
                }

                tick(data["FullState"]["state"]);
                if (data["FullState"]["state"]["state"] == "RUNNING" && !gAssign) {
                    sendAssign();
                }
                for ([player, istrokes] of gStrokes) {
                    socket.send(JSON.stringify({ "Pull": { "username": player, i: istrokes.length } }));
                }
            } else if (data["Kicked"]) {
                alert("You have been kicked from the lobby.");
                window.location.reload();
            } else if (data["Banned"]) {
                alert("You have been banned from the lobby.");
                window.location.reload();
            }
        });

        // Event listener for WebSocket errors
        socket.addEventListener('error', event => {
            console.error('WebSocket error:', event);
        });

        // Event listener for WebSocket connection closure
        socket.addEventListener('close', event => {
            setTimeout(connect, 4000);
        });
    }

    function tick(state) {
        gState = state;
        let timer = document.getElementById("timer");
        if (state["state"] == "RUNNING") {
            document.getElementById("progress-container").style.display = "flex";
            document.getElementById("lobby-container").style.display = "none";
            document.getElementById("endgame-container").style.display = "none";
            timer.style.display = "block";
            timer.value = state["time"];
            timer.max = state["timelimit"];
            on_visible();

            if (state["gametype"] == "Classic" || state["gametype"] == "Evolution") {
                if (gLastDrawer !== state["drawer"]) {
                    if (state["gametype"] === "Classic" || gLastDrawer === null) {
                        clear_canvas();
                    }
                    gLastDrawer = state["drawer"];
                }

                if (state["drawer"] !== gName) {
                    document.getElementById("word").textContent = "Guess the word!";
                    document.getElementById("word").style.backgroundColor = "blue";
                    document.getElementById("drawing").style.display = "none";
                    document.getElementById("gallery").style.display = "flex";
                } else {
                    document.getElementById("word").textContent = "Please draw: " + state["word"];
                    document.getElementById("word").style.backgroundColor = "green";
                    document.getElementById("drawing").style.display = "block";
                    document.getElementById("gallery").style.display = "flex";
                }
            } else {
                document.getElementById("drawing").style.display = "block";
                document.getElementById("gallery").style.display = "flex";
            }
        } else if (state["state"] == "LOBBY") {
            gameover = false;
            gLastDrawer = null;
            document.getElementById("progress-container").style.display = "none";
            document.getElementById("lobby-container").style.display = "block";
            document.getElementById("endgame-container").style.display = "none";
            timer.style.display = "none";
        } else if (state["state"] == "POSTGAME") {
            document.getElementById("progress-container").style.display = "none";
            document.getElementById("lobby-container").style.display = "none";
            document.getElementById("endgame-container").style.display = "block";
            timer.style.display = "none";
            gameend();
        }
        if (gName == state["host"]) {
            document.getElementById("start").style.display = "block";
            document.getElementById("restart").style.display = "block";
        }
    }

    function gameend() {
        if (gameover) {
            return;
        }
        gameover = true;
        sendDrawing();
        if (gState && gState["gametype"] == "Story") {
            setTimeout(show_storybook, 3000);
        } else {
            setTimeout(show_winners, 3000);
        }
    }

    function show_storybook() {
        let namelist = document.getElementById("user-list-3");
        namelist.style.display = "none";

        let values = Object.entries(gState["players"]).filter(([_, p]) => p.page !== null && p.page !== undefined);
        values.sort((a, b) => a[1].page - b[1].page);

        let finalGallery = document.getElementById("finalgallery");
        finalGallery.innerHTML = "";
        finalGallery.style.display = "flex";
        finalGallery.style.flexDirection = "column";
        finalGallery.style.alignItems = "center";

        for (let i = 0; i < values.length; ++i) {
            let player = values[i][0];
            let pageData = values[i][1];

            let pageContainer = document.createElement("div");
            pageContainer.style.marginBottom = "40px";
            pageContainer.style.textAlign = "center";
            pageContainer.style.border = "1px solid #ccc";
            pageContainer.style.padding = "20px";
            pageContainer.style.borderRadius = "10px";
            pageContainer.style.backgroundColor = "rgba(0, 0, 0, 0.5)";

            let promptText = document.createElement("h3");
            promptText.textContent = "Page " + pageData.page + ": " + pageData.word;

            let authorText = document.createElement("p");
            authorText.textContent = "Drawn by: " + player;
            authorText.style.fontStyle = "italic";

            let image = document.createElement("img");
            image.style.maxWidth = "800px";
            image.style.width = "100%";
            image.style.marginTop = "10px";
            image.style.border = "2px solid white";
            image.alt = "Drawing by " + player + " for prompt: " + pageData.word;

            if (pageData.image_path) {
                image.src = getBasePath() + pageData.image_path;
            } else {
                image.src = getBasePath() + "drawings/" + player + "-" + pageData.word.replaceAll(" ", "-") + ".png";
            }

            pageContainer.appendChild(promptText);
            pageContainer.appendChild(authorText);
            pageContainer.appendChild(image);
            finalGallery.appendChild(pageContainer);
        }
    }

    function show_winners() {
        let namelist = document.getElementById("user-list-3");
        let values = Object.entries(gState["players"]);
        values.sort((a, b) => a[1].score - b[1].score); // Sort ascending (worst to best)
        let highscore = Math.max(...values.map(x => x[1].score));
        let lowscore = Math.min(...values.map(x => x[1].score));
        for (let i = 0; i < values.length; ++i) {
            setTimeout(function () {
                let player = values[i][0];
                let child = add_player(player);
                child.style.width = "10%";
                namelist.appendChild(child);
                child.innerHTML = "";
                let thumb = document.createElement("img");
                thumb.style.height = "50px";
                thumb.style.width = "50px";
                thumb.style.objectFit = "contain";
                thumb.style.marginRight = "10px";
                thumb.style.verticalAlign = "middle";
                thumb.alt = "Thumbnail of drawing by " + player;
                child.appendChild(thumb);

                let txtSpan = document.createElement("span");
                txtSpan.style.verticalAlign = "middle";
                child.appendChild(txtSpan);

                try {
                    let image = document.createElement("div");
                    image.classList = "finalimagecontainer";
                    let picture = document.createElement("img");
                    picture.alt = "Full drawing by " + player;
                    gstrks = gStrokes.get(player);
                    if (gstrks) {
                        redraw_other(gMap.get(player).getContext("2d"), gstrks);
                    }
                    if (gState["players"][player] && gState["players"][player]["image_path"]) {
                        picture.src = getBasePath() + gState["players"][player]["image_path"];
                    } else {
                        picture.src = getBasePath() + "drawings/" + player + "-" + gAssign.replaceAll(" ", "-") + ".png";
                    }
                   thumb.src = picture.src;
                    image.onclick = function() {
                        //picture.src = "/drawings/" + 
                        Array.prototype.forEach.call(document.getElementsByClassName("finalimagecontainer"), d=>d.style.display = "none");
                    };
                    image.appendChild(picture);
                    document.getElementById("finalgallery").appendChild(image);
                    gImgMap.set(player, image);
                } catch (e) {console.log(e)}
                txtSpan.textContent = player + " [0]";
                if (gState["players"][player]["score"] == highscore) {
                    child.setAttribute("winner", "true");
                }
                child.setAttribute("moving", "true");
                setTimeout(function () {
                    child.style.width = (10 + (gState["players"][player]["score"] * 80 / (highscore || 1))) + "%";
                    var tally = 0;
                    var myInterval = setInterval(function () {
                        tally += Math.ceil(gState["players"][player]["score"] / 80);
                        if (tally >= gState["players"][player]["score"]) {
                            tally = gState["players"][player]["score"];
                            clearInterval(myInterval);
                        }
                        txtSpan.textContent = player + " [" + tally + "]";
                    }, 16);
                    setTimeout(function () {
                        child.setAttribute("moving", "false");
                    }, 500);
                }, 1000);
            }, i * 3000);
        }
    }

    function get_namelist(state) {
        if (state["state"] == "RUNNING") {
            return document.getElementById("user-list-1");
        } else {
            return document.getElementById("user-list-2");
        }
    }

    gUndo = function (qty) {
        //lastStroke -= 2;
        lastStroke = strokes.length;
        socket.send(JSON.stringify({ "Undo": { "i": qty } }));
    }

    function add_player(player) {
        if (!gMapLobby.has(player)) {
            const listItem = document.createElement('li');
            listItem.textContent = player;
            listItem.classList.add('user-list-item');
            listItem.setAttribute("__player", player);
            listItem.setAttribute("role", "button");
            listItem.setAttribute("tabindex", "0");
            listItem.setAttribute("aria-label", "Player " + player);
            listItem.onclick = player_click;
            listItem.onkeydown = function(e) {
                if (e.key === "Enter" || e.key === " ") {
                    if (e.target.tagName.toLowerCase() === 'button') return;
                    e.preventDefault();
                    player_click.call(this, e);
                }
            };
            let kickBtn = document.createElement("button");
            kickBtn.textContent = "Kick";
            kickBtn.className = "kick-btn";
            kickBtn.setAttribute("aria-label", "Kick " + player);
            kickBtn.style.display = "none";
            kickBtn.onclick = function(e) { e.stopPropagation(); if (confirm("Are you sure you want to kick " + player + "?")) { socket.send(JSON.stringify({"Kick": {"player": player}})); } };
            let banBtn = document.createElement("button");
            banBtn.textContent = "Ban";
            banBtn.className = "ban-btn";
            banBtn.setAttribute("aria-label", "Ban " + player);
            banBtn.style.display = "none";
            banBtn.onclick = function(e) { e.stopPropagation(); if (confirm("Are you sure you want to ban " + player + "?")) { socket.send(JSON.stringify({"Ban": {"player": player}})); } };
            let nameSpan = document.createElement("span");
            nameSpan.textContent = player;
            listItem.innerHTML = "";
            listItem.appendChild(nameSpan);
            listItem.appendChild(kickBtn);
            listItem.appendChild(banBtn);
            gMapLobby.set(player, listItem);
        }
        let nametag = gMapLobby.get(player);
        return nametag;
    }

    function player_click(e) {
        let clickedPlayer = e.currentTarget.getAttribute("__player");

        // Prevent toggle if the click was directly on a button
        if (e.target.tagName.toLowerCase() !== 'button') {
            if (gState && gState["host"] == gName && clickedPlayer != gName) {
                let kickBtn = e.currentTarget.querySelector(".kick-btn");
                let banBtn = e.currentTarget.querySelector(".ban-btn");
                if (kickBtn && banBtn) {
                    if (kickBtn.style.display !== "inline-block") {
                        kickBtn.style.display = "inline-block";
                        banBtn.style.display = "inline-block";
                    } else {
                        kickBtn.style.display = "none";
                        banBtn.style.display = "none";
                    }
                }
            }
        }

        if (gState["state"] == "RUNNING") {
            return;
        } else if (gState["state"] == "POSTGAME") {
            gImgMap.get(clickedPlayer).style.display = "block";
            gImgMap.get(clickedPlayer).querySelector("img").style.display = "block";

        }
    }

    function cycle(_backwards) {
        return;
        if (gState["state"] == "RUNNING") {
            let e = document.querySelector(".user-list-item[selected=\"true\"] + li") || document.querySelector("li.user-list-item:nth-child(1)");
            console.log(e);
            for (let p of gMap.values()) {
                p.style.display = "none";
            }
            for (let p of gMapLobby.values()) {
                p.setAttribute("selected", "false");
            }
            let can = gMap.get(e.getAttribute("__player"));
            gstrks = gStrokes.get(e.getAttribute("__player"));
            can.style.display = "block";
            see_element(can);
            if (gstrks) {
                redraw_other(can.getContext("2d"), gstrks);
            }
            redraw();
            gMapLobby.get(e.getAttribute("__player")).setAttribute("selected", "true");
        }
    }

    function current_view(e) {
        for (e of document.getElementsByClassName("image")) {
            if (e.style.display != "none") {
                return e;
            }
        }
    }

    function undo_other(drawer) {
        if (drawer == gName) {
            return;
        }
        if (!gStrokes.has(drawer)) {
            gStrokes.set(drawer, []);
            return;
        }
        let strks = gStrokes.get(drawer);
        gStrokes.set(drawer, strks.slice(0, strks[strks.length - 1]["t"]));
        add_drawing(drawer, []);
    }

    function add_drawing(drawer, image) {
        return;
        if (drawer == gName) {
            return;
        }
        if (!gStrokes.has(drawer)) {
            gStrokes.set(drawer, []);
        }
        if (!gMap.has(drawer)) {
            let newCanvas = document.createElement("canvas");
            gMap.set(drawer, newCanvas);
            newCanvas.classList = "image";
            document.getElementById("gallery").appendChild(newCanvas);
        }
        let strks = gStrokes.get(drawer).concat(image.map(x => JSON.parse(x)));
        gStrokes.set(drawer, strks);
        let canvas = gMap.get(drawer);
        see_element(canvas);
        redraw_other(canvas.getContext("2d"), strks);
        redraw();
        return canvas;
    }

    function start() {
        socket.send(JSON.stringify({ "Start": {} }));
    }

    function restart() {
        socket.send(JSON.stringify({ "Restart": {} }));
    }

    function sendAssign() {
        socket.send(JSON.stringify({ "Assign": {} }));
    }

    function sendGuess(g) {
        socket.send(JSON.stringify({ "Guess": { "guess": g } }));
    }

    function sendDrawing() {
        var data =  canvas.toDataURL();
            //strokes.slice(lastStroke).map(x => JSON.stringify(x));
        lastStroke = strokes.length;
        if (data.length > 0) {
            socket.send(JSON.stringify({ "Image": { "image": data } }));
        }
    }
    
    function add_guesser(guesser) {
        let a = add_player(guesser);
        if (!gMyGuessers.has(guesser)) {
            gMyGuessers.set(guesser, a);
            a.setAttribute("movingguesser", "true");
            a.setAttribute("guesser", "true");
            setTimeout(function() {a.setAttribute("movingguesser", "false");}, 1);
        }
    }

    function add_guessed(drawer) {
        let a = add_player(drawer);
        if (!gMyGuesses.has(drawer)) {
            gMyGuesses.set(drawer, a);
            a.setAttribute("movingguessed", "true");
            a.setAttribute("guessed", "true");
            setTimeout(function() {a.setAttribute("movingguessed", "false");}, 1);
        }
    }
    function draw_event_handler(e) {
        e.preventDefault();
        if (gState && (gState["gametype"] == "Classic" || gState["gametype"] == "Evolution") && gState["drawer"] == gName) {
            sendDrawing();
        }
    }
    let canvas = document.getElementById("canvas");
    canvas.addEventListener("touchend", draw_event_handler);
    canvas.addEventListener("mouseleave", draw_event_handler);
    canvas.addEventListener("mouseup", draw_event_handler);
    function fetch_lobbies() {
        const refreshBtn = document.getElementById("refresh-lobbies");
        if (refreshBtn) {
            refreshBtn.disabled = true;
        }
        const list = document.getElementById("lobby-list");
        list.innerHTML = "";
        const loadingLi = document.createElement("li");
        loadingLi.textContent = "Loading lobbies...";
        loadingLi.style.color = "#888";
        loadingLi.style.fontStyle = "italic";
        loadingLi.style.padding = "10px";
        loadingLi.setAttribute("role", "status");
        loadingLi.setAttribute("aria-live", "polite");
        list.appendChild(loadingLi);

        fetch(getBasePath() + 'lobbies')
            .then(response => {
                if (!response.ok) {
                    throw new Error("Failed to fetch lobbies");
                }
                return response.json();
            })
            .then(data => {
                list.innerHTML = "";
                if (data.length === 0) {
                    const li = document.createElement("li");
                    li.textContent = "No active lobbies found. Create one to get started!";
                    li.style.color = "#888";
                    li.style.fontStyle = "italic";
                    li.style.padding = "10px";
                    list.appendChild(li);
                } else {
                    data.forEach(lobby => {
                        const li = document.createElement("li");
                        const btn = document.createElement("button");
                        btn.textContent = lobby;
                        btn.setAttribute("aria-label", "Join lobby " + lobby);
                        btn.onclick = () => join_lobby(lobby);
                        li.appendChild(btn);
                        list.appendChild(li);
                    });
                }
            })
            .catch(error => {
                list.innerHTML = "";
                const errorLi = document.createElement("li");
                errorLi.textContent = "Failed to load lobbies. Please try again.";
                errorLi.style.color = "#ff6b6b";
                errorLi.style.fontStyle = "italic";
                errorLi.style.padding = "10px";
                errorLi.setAttribute("role", "alert");
                list.appendChild(errorLi);
            })
            .finally(() => {
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                }
            });
    }

    function join_lobby(lobby, customWords, timeLimit, gametype) {
        if (!lobby) return;
        gLobby = lobby;
        document.getElementById("lobby-selection").style.display = "none";
        document.getElementById("game").style.display = "block";
        connect(customWords, timeLimit, gametype);
    }

    function handleLogin() {
        let nameInput = document.getElementById("name");
        let nameVal = nameInput.value.trim();
        if (!nameVal) return;
        gName = nameVal;
        document.getElementById("login").style.display = "none";
        document.getElementById("lobby-selection").style.display = "block";
        fetch_lobbies();
        document.cookie = gName;

        // Connect to global chat
        let wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
        let wsPort = window.location.port ? ':' + window.location.port : '';
        console.log(wsProtocol + window.location.hostname + wsPort + getBasePath() + 'global_chat?name=' + encodeURIComponent(gName));
        globalChatSocket = new WebSocket(wsProtocol + window.location.hostname + wsPort + getBasePath() + 'global_chat?name=' + encodeURIComponent(gName));
        globalChatSocket.addEventListener('message', event => {
            let chat = document.getElementById('global-chat-messages');
            let line = document.createElement("div");
            line.textContent = event.data;
            chat.append(line);
            while (chat.children.length > MAX_CHAT) {
                chat.removeChild(chat.children[0]);
            }
            chat.scrollTop = chat.scrollHeight;
        });
    }

    document.getElementById("name").addEventListener("keydown", function (e) {
        if (e.key  == "Enter") {
            handleLogin();
        }
    });

    document.getElementById("login-btn").addEventListener("click", function (e) {
        handleLogin();
    });

    setupInputValidation("name", "login-btn");

    function sendGlobalChatMessage() {
        const input = document.getElementById("global-chat-input");
        if (input.value.trim() !== "") {
            if (globalChatSocket && globalChatSocket.readyState === WebSocket.OPEN) {
                globalChatSocket.send(input.value);
                input.value = "";
                input.dispatchEvent(new Event("input"));
            }
        }
    }

    document.getElementById("global-chat-input").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            sendGlobalChatMessage();
        }
    });

    document.getElementById("global-chat-send").addEventListener("click", sendGlobalChatMessage);

    setupInputValidation("global-chat-input", "global-chat-send");

    document.getElementById("refresh-lobbies").onclick = fetch_lobbies;
    document.getElementById("show-create-lobby-btn").onclick = function() {
        document.getElementById("create-lobby-section").style.display = "flex";
        document.getElementById("show-create-lobby-btn").style.display = "none";
    };
    document.getElementById("cancel-create-lobby").onclick = function() {
        document.getElementById("create-lobby-section").style.display = "none";
        document.getElementById("show-create-lobby-btn").style.display = "inline-block";
        const newLobbyNameInput = document.getElementById("new-lobby-name");
        newLobbyNameInput.value = "";
        newLobbyNameInput.dispatchEvent(new Event("input"));
        document.getElementById("new-lobby-words").value = "";
        document.getElementById("new-lobby-time").value = "120";
        document.getElementById("new-lobby-mode").value = "AI";
    };
    document.getElementById("create-lobby").onclick = function() {
        const name = document.getElementById("new-lobby-name").value;
        const customWords = document.getElementById("new-lobby-words").value;
        const timeLimit = document.getElementById("new-lobby-time").value;
        const gametype = document.getElementById("new-lobby-mode").value;
        if (name.trim() !== "") {
            join_lobby(name.trim(), customWords.trim(), timeLimit, gametype);
        }
    };
    setupInputValidation("new-lobby-name", "create-lobby");

    document.getElementById("new-lobby-name").addEventListener("keydown", function (e) {
        if (e.key  == "Enter") {
            const name = e.target.value;
            const customWords = document.getElementById("new-lobby-words").value;
            const timeLimit = document.getElementById("new-lobby-time").value;
            const gametype = document.getElementById("new-lobby-mode").value;
            if (name.trim() !== "") {
                join_lobby(name.trim(), customWords.trim(), timeLimit, gametype);
            }
        }
    });
    function handleGuessSubmit() {
        const input = document.getElementById("guess");
        if (input.value.trim() !== "") {
            gName = input.value;
            sendGuess(input.value);
            input.value = "";
            input.dispatchEvent(new Event("input"));
        }
    }

    document.getElementById("guess").addEventListener("keydown", function search(e) {
        if (e.key  == "Enter") {
            handleGuessSubmit();
        } else if (e.key  == "Tab") {
            //cycle(e.shiftKey);
            e.preventDefault();
        }
    });

    document.getElementById("guess-send").addEventListener("click", handleGuessSubmit);

    setupInputValidation("guess", "guess-send");

    //document.onmouseup = function () { document.getElementById("guess").focus(); };

    document.getElementById("start").onclick = function search(e) {
        start();
    };
    document.getElementById("restart").onclick = function search(e) {
        restart();
    };
    document.getElementById("progress-container").style.display = "none";
    document.getElementById("lobby-container").style.display = "none";
    document.getElementById("endgame-container").style.display = "none";
    if (document.cookie != "") {
        document.getElementById("name").value = document.cookie;
    }
    window.onresize = function () {
        try {
            see_element(current_view());
            redraw_other(current_view().getContext("2d"), gstrks);
            redraw();
        } catch { }
    };
    setInterval(function () {
        if (gState && gState["state"] == "RUNNING") {
            let timer = document.getElementById("timer");
            timer.value += 1;
        }
        let judge = document.getElementById("judge");
        if (!lastJudged || lastJudged + 10000 < Date.now()) {
            judge.disabled = false;
        }
    }, 1000);
    document.getElementById("judge").onclick = function(e) {
        let now = Date.now();
        if (lastJudged && lastJudged > now - 10000) {
            return
        }
        lastJudged = now;
        sendDrawing();
        e.target.disabled = true;
    };
}
