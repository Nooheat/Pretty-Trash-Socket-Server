const app = require('express')();

const server = require('http').createServer(app);

const io = require('socket.io')(server);

let connections = {};

String.prototype.replaceAt = function (index, replacement) {
    return this.substr(0, index) + replacement + this.substr(index + replacement.length);
}

String.prototype.deleteAt = function (index, length) {
    let fixed = this.split('');
    fixed.splice(index, -length);
    return fixed.join('');
}

let contents = "";

const sql = require('./mysql');
sql.connect();

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
})

app.get('/room', function (req, res) {
    res.sendFile(__dirname + '/room.html');
})

io.on('connection', function (socket) {

    socket.on('subscribe', function (user) {
        connections[socket.id] = user.name;
    })

    socket.on("edit", function (data) {
        console.log(data);
        // get sender's name 
        sender = connections[`${socket.id}`];

        if (data.length && data.length < 0) {
            contents = contents.deleteAt(data.startFrom, data.length);
        }

        if (data.contents) {
            contents = contents.replaceAt(data.startFrom, data.contents);
        }

        sql.query("INSERT INTO chat_logs(`name`, `startFrom`, `contents`, `length`) VALUES(?,?,?,?);", [sender, data.startFrom, data.contents, data.length])
            .then((result) => {
                return sql.query("SELECT MAX(chat_logs.index) MAX_INDEX FROM chat_logs;")
            })
            .then((results) => {
                if (results[0].MAX_INDEX % 100 == 0) {
                    console.log("SNAPSHOT ::: ");
                    sql.query("INSERT INTO contents_snapshots(`index`, `contents`) VALUES(?,?);", [results[0].MAX_INDEX, contents])
                        .then((snapshot) => {
                            console.log(snapshot);
                            return;
                        })
                } else return;
            })
            .catch((err) => {
                console.log(err);
            })

        // forEach :: all of connections socket id
        Object.keys(connections).forEach((socketId) => {

            // if sender is me :: Do nothing
            if (socket.id === socketId) return true; // in forEach Syntax, 'return true;' = 'continue;', 'return false;' = 'break;'

            // sender isn't me && the name doesn't same with other user
            if (connections[socketId] !== sender) {
                // emit 'non-block-chat' event  to the users
                io.to(socketId).emit('edit', {
                    "startFrom": data.startFrom,
                    "contents": data.contents,
                    "length": data.length
                })
            }

            // sender isn't me && the name same with other users
            // emit 'block-chat' event  to the users
            else io.to(socketId).emit('edit', {
                "startFrom": data.startFrom,
                "contents": data.contents.replace(/[^\\n]/g, '◼︎'),
                "length": data.length
            });
        })
    });

    socket.on('disconnect', function () {
        delete connections[socket.id];
        console.log(connections);
    });
})


server.listen(3000, function () {
    console.log('IO SERVER LISTENING ON 3000 PORT')
})