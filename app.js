const http = require('http')
const url = require('url')
const fs = require('fs')
const socket = require('socket.io')
const mimeTypes = require('mime-types').lookup

const port = 3000

const server = http.createServer((req, res) => {
    let parsedURL = url.parse(req.url, true)
    let path = parsedURL.path.replace(/^\/+|\/+^$/g, "")
    if (path == "") {
        path = "index.html";
    }
    if (path.endsWith("=core.html")) { // send the user to fake URL
        path = path.slice(0, -10);
        for (var i = 0; i < playlobbies.length; i++) {
            if (path == playlobbies[i].gameUrl)
                path = "core.html";
        }
    }
    let file = __dirname + "/public/" + path
    fs.readFile(file, function (error, data) {
        if (error) {
            console.log(`File Not Found ${file}`)
            res.writeHead(404)
            res.end()
        } else {
            res.setHeader("X-Content-Type-Options", "nosniff")
            let mime = mimeTypes(path)
            res.writeHead(200, { "Content-Type": mime })
        }
        res.end(data)
    })
})

server.listen(port, function (error) {
    if (error) {
        console.log('Something went wrong ', error)
    } else {
        console.log('Server is listening on port ' + port)
    }
})

var rowIdCount = 0;

var lobbies = [];
var playlobbies = [];

var io = socket(server)

function fetchLobbies(socket) {
    socket.emit('gameLobbies', lobbies); // show the lobbies on the client side, this has to run on connection
}

function deleteGames(socket) { // search for the Socket ID from the lobbies, If it's found then delete it
    for (var i = 0; i < lobbies.length; i++) {
        if (lobbies[i].socketID == socket.id) {
            io.emit('gameDeleted', lobbies[i].roomID);
            lobbies.splice(i, 1);
            break;
        }
    }
}

function randomString(length, chars) { // N char long random string
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
    return result;
}

io.on('connection', function (socket) {
    console.log(`New connection: ${socket.id}`);

    socket.emit('checkURL'); // To get the user's current URL
    fetchLobbies(socket);

    socket.on('sendURL', function (msg) { // Got the URL, now search the array for the path that has been coming from the user
        path = msg.slice(0, -9).slice(1, -1); // Format it
        for (var i = 0; i < playlobbies.length; i++) {
            if (playlobbies[i].gameUrl == path) { // Found the game
                if (playlobbies[i].player1SID == "" || playlobbies[i].player1SID == null) { // If player1 spot is open then assign It the user's new Socket ID
                    playlobbies[i].player1SID = socket.id;
                } else if (playlobbies[i].player2SID == "" || playlobbies[i].player2SID == null) { // If not the player2 is where It needs to be
                    playlobbies[i].player2SID = socket.id;
                }
            }
        }
    });

    socket.on('disconnect', function () { // if a user disconnects from the server, then delete it's game
        console.log(`Disconnected: ${socket.id}`);
        deleteGames(socket);
    });

    socket.on('gameDeleted', function () { // if the user presses the delete game button then also delete it's game 
        deleteGames(socket);
    });

    socket.on('gameJoin', function (msg, name) {
        if (name.length > 6 && name.length < 20) {
            for (var i = 0; i < lobbies.length; i++) {
                if (lobbies[i].roomID == msg) {
                    // make a random alphanumerical n length char (this will be the url)
                    var requrl = randomString(20, '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');
                    var locData = SearchForDeletedGames(); // If there is a deleted game, then replace it by this new one
                    if (locData == 100000) {
                        // add the url, the names of the user's and the empty space for their socket id which will get captured once they join the url
                        playlobbies.push({ gameUrl: requrl, player1name: lobbies[i].playerName, player2name: name, player1SID: "", player2SID: "", player1color: 0, player2color: 1, turn: 0, gameArr: gamesArr.length, gameStatus: "online" });
                        gamesArr.push(Create2DArray(8));
                        DefaultState(gamesArr.length - 1);
                    } else {
                        playlobbies.push({ gameUrl: requrl, player1name: lobbies[i].playerName, player2name: name, player1SID: "", player2SID: "", player1color: 0, player2color: 1, turn: 0, gameArr: locData, gameStatus: "online" });
                        gamesArr[locData] = Create2DArray(8);
                        DefaultState(locData - 1);
                    }
                    // format the url for easier identification  
                    var destination = '/' + requrl + '=core.html';
                    // send the url and redirect the user who created the lobby
                    io.to(lobbies[i].socketID).emit('redirect', destination);
                    // same with the user who clicked the join button 
                    socket.emit('redirect', destination);
                    // delete this lobby from the public lobbies Object
                    deleteGames(socket);
                    break;
                }
            }
        }
    });

    socket.on('gameMade', function (msg) { // Made a new game public
        if (msg.playerName.length > 6 && msg.playerName.length < 20) {
            var found = false;
            for (var i = 0; i < lobbies.length; i++) {
                if (lobbies[i].socketID == socket.id) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                rowIdCount++;
                lobbies.push({ roomID: rowIdCount, playerName: msg.playerName, gameLength: msg.gameLength, socketID: socket.id });
                msg = Object.assign({ roomID: rowIdCount }, msg);

                socket.emit('gameMadeResponse', msg);
                msg.creator = false;
                socket.broadcast.emit('gameMadeResponse', msg);
            }
        } else { // if the char count isn't between 7-19
            //error message
        }
    });

    socket.on('playerNamesServer', function () { // Get the names of the players
        for (var i = 0; i < playlobbies.length; i++) {
            if (socket.id == playlobbies[i].player1SID) {
                io.to(playlobbies[i].player1SID).emit('playerNamesClient', playlobbies[i].player1name, playlobbies[i].player2name, false);
            }
            else if (socket.id == playlobbies[i].player2SID) {
                io.to(playlobbies[i].player2SID).emit('playerNamesClient', playlobbies[i].player1name, playlobbies[i].player2name, true);
            }
        }
    });

    socket.on('pieceMovement', function (draggedItemTitle, wantedposx, wantedposy, dragNum, dropNum) { // Moving a piece
        let p;
        console.log("Data received by server!");
        for (var i = 0; i < playlobbies.length; i++) { // go through the lobbies
            if (playlobbies[i].player1SID == socket.id || playlobbies[i].player2SID == socket.id) { // If the ID who moved the piece is in the array, then proceed
                for (let x = 0; x < gamesArr[playlobbies[i].gameArr].length; x++) { //loop through the games lobby
                    for (let y = 0; y < gamesArr[playlobbies[i].gameArr].length; y++) {
                        if (gamesArr[playlobbies[i].gameArr][y][x] == draggedItemTitle) {  // if the title is found, then proceed
                            if ((y != wantedposy) || (x != wantedposx)) {   // If this isnt true, then the user would just want to move the piece to the same position as it was already on
                                if ((playlobbies[i].player1SID == socket.id && playlobbies[i].turn == 0 && gamesArr[playlobbies[i].gameArr][y][x].toString().split('')[1] == 0) 
                                    || (playlobbies[i].player2SID == socket.id && playlobbies[i].turn == 1 && gamesArr[playlobbies[i].gameArr][y][x].toString().split('')[1] == 1)) { // Determining the current turn, and if the right socket moves the piece
                                    if (gamesArr[playlobbies[i].gameArr][y][x].toString().split('')[1] != gamesArr[playlobbies[i].gameArr][wantedposy][wantedposx].toString().split('')[1]) { // If the user wants to take his own piece then stop it
                                        let chars = gamesArr[playlobbies[i].gameArr][y][x].toString().split(''); // Sorting information about the piece that's being dropped
                                        let piece = chars.toString().split('')[0]; 
                                        let title = gamesArr[playlobbies[i].gameArr][y][x].toString();
                                        let color = chars[1] == 0 ? "White" : "Black";
                                        switch (parseInt(piece)) {
                                            case 1:
                                                p = new Pawn(x, y, wantedposx, wantedposy, "Pawn", color, title, playlobbies[i].gameArr);
                                                if (p.IsItCapture())
                                                    p.PawnCapture();
                                                else
                                                    p.PawnMove();
                                                break;
                                            case 2:
                                                p = new Rook(x, y, wantedposx, wantedposy, "Rook", color, title, playlobbies[i].gameArr);
                                                if (p.IsItCapture())
                                                    p.RookCapture();
                                                else
                                                    p.RookMove();
                                                break;
                                            case 3:
                                                p = new Knight(x, y, wantedposx, wantedposy, "Knight", color, title, playlobbies[i].gameArr);
                                                if (p.IsItCapture())
                                                    p.KnightCapture();
                                                else
                                                    p.KnightMove();
                                                break;
                                            case 4:
                                                p = new Bishop(x, y, wantedposx, wantedposy, "Bishop", color, title, playlobbies[i].gameArr);
                                                if (p.IsItCapture())
                                                    p.BishopCapture();
                                                else
                                                    p.BishopMove();
                                                break;
                                            case 5:
                                                p = new Queen(x, y, wantedposx, wantedposy, "Queen", color, title, playlobbies[i].gameArr);
                                                if (p.IsItCapture())
                                                    p.QueenCapture();
                                                else
                                                    p.QueenMove();
                                                break;
                                            case 6:
                                                p = new King(x, y, wantedposx, wantedposy, "King", color, title, playlobbies[i].gameArr);
                                                if (p.IsItCapture())
                                                    p.KingCapture();
                                                else
                                                    p.KingMove();
                                                break;
                                            default:
                                                console.log('Default runs');
                                                break;
                                        }
                                        if (p.possible) { // If it's possible then send the data to the sockets
                                            console.log("Possible");
                                            if(playlobbies[i].turn == 0)
                                                playlobbies[i].turn = 1;
                                            else
                                                playlobbies[i].turn = 0;
                                                
                                            if (p.captured != "" || p.captured != null) { // If the user takes a piece, then send that piece's data to the client so It can be deleted from the DOM 
                                                io.to(playlobbies[i].player1SID).emit('result', dragNum, dropNum, p.captured);
                                                io.to(playlobbies[i].player2SID).emit('result', dragNum, dropNum, p.captured);
                                            }
                                            else {  // else just send the normal data
                                                io.to(playlobbies[i].player1SID).emit('result', dragNum, dropNum);
                                                io.to(playlobbies[i].player2SID).emit('result', dragNum, dropNum);
                                            }
                                        }
                                        else {
                                            console.log("Not possible!");
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
});

var gamesArr = [];

function Create2DArray(rows) {
    var arr = [];
    for (var i = 0; i < rows; i++) {
        arr[i] = [];
    }
    return arr;
}

function SearchForDeletedGames() { 
    for (var i = 0; i < playlobbies.length; i++) {
        if (playlobbies[i].gameStatus == "offline") {
            return i;
        }
    }
    return 100000;
}

function DefaultState(arrnum) { // This is the default state of the board, explanation below
    var arr0 = [211, 311, 411, 511, 611, 412, 312, 212];
    var arr1 = [110, 111, 112, 113, 114, 115, 116, 117];
    var arr2 = [999, 999, 999, 999, 999, 999, 999, 999];
    var arr3 = [100, 101, 102, 103, 104, 105, 106, 107];
    var arr4 = [201, 301, 401, 501, 601, 402, 302, 202];

    for (var i = 0; i < gamesArr[arrnum].length; i++) {
        gamesArr[arrnum][0][i] = arr0[i];
    }
    for (var i = 0; i < gamesArr[arrnum].length; i++) {
        gamesArr[arrnum][1][i] = arr1[i];
    }
    for (var i = 2; i < 6; i++) {
        for (var j = 0; j < gamesArr[arrnum].length; j++) {
            gamesArr[arrnum][i][j] = arr2[i];
        }
    }
    for (var i = 0; i < gamesArr[arrnum].length; i++) {
        gamesArr[arrnum][6][i] = arr3[i];
    }
    for (var i = 0; i < gamesArr[arrnum].length; i++) {
        gamesArr[arrnum][7][i] = arr4[i];
    }
}


//
// CHESS LOGIC
//

/*
basically the idea is, to make a unique id for every piece on the board
that way it'll be easy to track their location

1 = Pawn
2 = Rook
3 = Knight
4 = Bishop
5 = Queen
6 = King
99 = empty

White = 0
Black = 1
 
1-9

this + (white || black) + 1-9

PLAYER 0 == WHITE
PLAYER 1 == BLACK

*/

class Piece {
    constructor(x, y, wantedposx, wantedposy, piece, color, title, arrnum) { // storing every bit of information that can be used up
        this.captured;
        this.x = x; // current X position
        this.y = y; // current Y position
        this.wantedposx = wantedposx; // desired X position
        this.wantedposy = wantedposy; // desired Y position
        this.piece = piece; // name of the piece that's being moved
        this.color = color; // color of the piece that's being moved
        this.title = title; // title of the piece that's being moved
        this.arrnum = arrnum; // array that has to be modified and inspected
        this.possible = false;
    }

    //
    // Moving the piece horizontally, only four possibility
    // Up, Down, Left or Right
    //

    HorizontalMove() {
        if (this.xright == 1) {
            for (let i = this.x + 1; i < this.wantedposx; i++) {
                if (gamesArr[this.arrnum][this.y][i] != 999) {
                    return false;
                }
            }
        }
        else if (this.xleft == 1) {
            for (let i = this.x - 1; i > this.wantedposx; i--) {
                if (gamesArr[this.arrnum][this.y][i] != 999) {
                    return false;
                }
            }
        }
        else if (this.ydown == 1) {
            for (let i = this.y + 1; i < this.wantedposy; i++) {
                if (gamesArr[this.arrnum][i][this.x] != 999) {
                    return false;
                }
            }
        }
        else if (this.yup == 1) {
            for (let i = this.y - 1; i > this.wantedposy; i--) {
                if (gamesArr[this.arrnum][i][this.x] != 999) {
                    return false;
                }
            }
        }
        else {
            return false;
        }
        return true;
    }

    //
    // Same as for Horizontal movement, only four possibility
    //

    DiagonalMove() {
        if (Math.abs(this.wantedposx - this.x) == Math.abs(this.wantedposy - this.y)) {
            if (this.xright == 1 && this.yup == 1) {
                for (let i = this.y - 1, temp = this.x + 1; i > this.wantedposy; i--, temp++) {
                    if (gamesArr[this.arrnum][i][temp] != 999) {
                        return false;
                    }
                }
            }
            else if (this.xright == 1 && this.ydown == 1) {
                for (let i = this.y + 1, temp = this.x + 1; i < this.wantedposy; i++, temp++) {
                    if (gamesArr[this.arrnum][i][temp] != 999) {
                        return false;
                    }
                }
            }
            else if (this.xleft == 1 && this.ydown == 1) {
                for (let i = this.y + 1, temp = this.x - 1; i < this.wantedposy; i++, temp--) {
                    if (gamesArr[this.arrnum][i][temp] != 999) {
                        return false;
                    }
                }
            }
            else if (this.xleft == 1 && this.yup == 1) {
                for (let i = this.y - 1, temp = this.x - 1; i > this.wantedposy; i--, temp--) {
                    if (gamesArr[this.arrnum][i][temp] != 999) {
                        return false;
                    }
                }
            }
        }
        else {
            return false;
        }
        return true;
    }

    //
    // Tracking the path from the current, to the desired position.
    //

    CollisionDetect() {
        if (this.piece == "Pawn" && this.color == "Black") {
            for (let i = this.y + 1; i <= this.wantedposy; i++) {
                if (gamesArr[this.arrnum][i][this.x] != 999) {
                    return false;
                }
            }
        }
        else if (this.piece == "Pawn" && this.color == "White") {
            for (let i = this.y - 1; i >= this.wantedposy; i--) {
                if (gamesArr[this.arrnum][i][this.x] != 999) {
                    return false;
                }
            }
        }
        else if (this.piece == "Rook") {
            this.DirectionDetectHoriz();
            if (!this.HorizontalMove()) {
                return false;
            }
        }
        else if (this.piece == "Bishop") {
            this.DirectionDetectDiag();
            if (!this.DiagonalMove()) {
                return false;
            }
        }
        else if (this.piece == "Queen") {
            if (this.DirectionDetectHoriz()) {
                if (!this.HorizontalMove()) {
                    return false;
                }
            }
            else if (this.DirectionDetectDiag()) {
                if (!this.DiagonalMove()) {
                    return false;
                }
            }
        }
        else if (this.piece == "King") {
            if (this.DirectionDetectHoriz()) {
                if (!this.HorizontalMove()) {
                    return false;
                }
            }
            else if (this.DirectionDetectDiag()) {
                if (!this.DiagonalMove()) {
                    return false;
                }
            }
        }
        return true;
    }

    // Detecting Horizontal direction
    // x to the right
    // x to the left
    // y to up
    // y to down

    DirectionDetectHoriz() {

        this.xright = 0;
        this.xleft = 0;
        this.yup = 0;
        this.ydown = 0;

        if (this.piece == "Rook" || this.piece == "Queen" || this.piece == "King") {
            if (this.wantedposy - this.y < 0 && this.wantedposx - this.x == 0) {
                this.yup = 1;
                return true;
            }
            if (this.wantedposy - this.y > 0 && this.wantedposx - this.x == 0) {
                this.ydown = 1;
                return true;
            }
            if (this.wantedposx - this.x > 0 && this.wantedposy - this.y == 0) {
                this.xright = 1;
                return true;
            }
            if (this.wantedposx - this.x < 0 && this.wantedposy - this.y == 0) {
                this.xleft = 1;
                return true;
            }
        }
    }

    //
    // Same as above, just with Diagonal direction
    //

    DirectionDetectDiag() {

        this.xright = 0;
        this.xleft = 0;
        this.yup = 0;
        this.ydown = 0;

        if (this.piece == "Bishop" || this.piece == "Queen" || this.piece == "King") {
            if (this.wantedposy - this.y < 0) {
                this.yup = 1;
            }
            if (this.wantedposy - this.y > 0) {
                this.ydown = 1;
            }
            if (this.wantedposx - this.x > 0) {
                this.xright = 1;
            }
            if (this.wantedposx - this.x < 0) {
                this.xleft = 1;
            }
        }
        if (this.xright + this.yup + this.ydown + this.xleft >= 2)
            return true;
        else
            return false;
    }

    //
    // Updating the board, if possible is true then at the end an if statement catches it and visually moves the piece
    //

    MoveThePiece() {
        this.possible = true;
        gamesArr[this.arrnum][this.y][this.x] = 999;
        gamesArr[this.arrnum][this.wantedposy][this.wantedposx] = this.title;
    }

    //
    // Updating the board, and removing the piece visually
    //

    // gamesArr[this.arrnum][this.wantedposy][this.wantedposx] = title;
    Capture() {
        this.captured = gamesArr[this.arrnum][this.wantedposy][this.wantedposx];
        this.MoveThePiece();
    }

    IsItCapture() {
        if (gamesArr[this.arrnum][this.wantedposy][this.wantedposx] != 999)
            return true;
        return false;
    }
}

//
//  KNIGHT
//

class Knight extends Piece {
    KnightMove() {
        if (Math.abs(this.y - this.wantedposy) == 2 && Math.abs(this.x - this.wantedposx) == 1 ||
            Math.abs(this.y - this.wantedposy) == 1 && Math.abs(this.x - this.wantedposx) == 2)
            this.MoveThePiece();
    }
    KnightCapture() {
        if (Math.abs(this.y - this.wantedposy) == 2 && Math.abs(this.x - this.wantedposx) == 1 ||
            Math.abs(this.y - this.wantedposy) == 1 && Math.abs(this.x - this.wantedposx) == 2) {
            this.Capture();
        }
    }
}

//
//  KING
//
//   Y  X
//  -1,-1 | -1,0 | -1, +1
//   0,-1 | KING |  0, +1
//  +1,-1 | +1,0 | +1, +1

class King extends Piece {
    KingMove() {
        if (this.CollisionDetect()) {
            if ((Math.abs(this.y - this.wantedposy) == 1 || Math.abs(this.y - this.wantedposy) == 0) && (Math.abs(this.x - this.wantedposx) == 1 || Math.abs(this.x - this.wantedposx) == 0))
                this.MoveThePiece();
        }
    }
    KingCapture() {
        if (this.CollisionDetect()) {
            if ((Math.abs(this.y - this.wantedposy) == 1 || Math.abs(this.y - this.wantedposy) == 0) && (Math.abs(this.x - this.wantedposx) == 1 || Math.abs(this.x - this.wantedposx) == 0)) {
                this.Capture();
            }
        }
    }
}

//
//  QUEEN
//

class Queen extends Piece {
    QueenMove() {
        if (this.CollisionDetect()) {
            this.MoveThePiece();
        }
    }
    QueenCapture() {
        if (this.CollisionDetect()) {
            this.Capture();
        }
    }
}

//
//  BISHOP
//

class Bishop extends Piece {
    BishopMove() {
        if (this.CollisionDetect()) {
            this.MoveThePiece();
        }
    }
    BishopCapture() {
        if (this.CollisionDetect()) {
            this.Capture();
        }
    }
}

//
//  ROOK
//

class Rook extends Piece {
    RookMove() {
        if (this.CollisionDetect()) {
            this.MoveThePiece();
        }
    }
    RookCapture() {
        if (this.CollisionDetect()) {
            this.Capture();
        }
    }
}

//
//  PAWN
//

class Pawn extends Piece {
    PawnMove() {
        if (this.CollisionDetect()) {
            if (this.color == "White") {
                if (this.y == 6) {
                    //possible moves + 2 && +1 (first move)
                    if ((this.y - this.wantedposy == 2 || this.y - this.wantedposy == 1) && Math.abs(this.wantedposx - this.x) == 0) {
                        this.MoveThePiece();
                    }
                }
                else {
                    if (this.y - this.wantedposy == 1 && Math.abs(this.wantedposx - this.x) == 0) {
                        this.MoveThePiece();
                    }
                }
            } else {
                if (this.y == 1) {
                    //possible moves - 2 && -1 (first move)
                    if ((this.y - this.wantedposy == -2 || this.y - this.wantedposy == -1) && Math.abs(this.wantedposx - this.x) == 0) {
                        this.MoveThePiece();
                    }
                }
                else {
                    //possible moves - 1
                    if (this.y - this.wantedposy == -1 && Math.abs(this.wantedposx - this.x) == 0) {
                        this.MoveThePiece();
                    }
                }
            }
        }
    }
    PawnCapture() {
        if (Math.abs(this.x - this.wantedposx) + Math.abs(this.y - this.wantedposy) == 2) {
            this.Capture();
        }
    }
}