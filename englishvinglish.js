var https = require('https');
var fs = require('fs');
var sqlite3 = require('sqlite3');
var TelegramApi = require('node-telegram-bot-api');

var API_KEY = 'YOUR_BOT_API_KEY';
var PORT = 3000;
var PUBLIC_CERT_PATH = 'public.pem';
var PRIATE_KEY_PATH = 'private.key';
var DATABASE_NAME = 'englishvinglish.db';

var bot = new TelegramApi(API_KEY, {polling: false});

var options = {
	key: fs.readFileSync(PRIATE_KEY_PATH),
	cert: fs.readFileSync(PUBLIC_CERT_PATH),
};

function valueWithNull(value) {
	return value < 10 ? "0" + value : value;
}

function log() {
	var date = new Date();
	var millis = date.getMilliseconds();
	var dateStr = [
		valueWithNull(date.getDate()), ".",
		valueWithNull(date.getMonth() + 1), ".",
		date.getFullYear(), " ",
		valueWithNull(date.getHours()), ":",
		valueWithNull(date.getMinutes()), ":",
		valueWithNull(date.getSeconds()), ".",
		millis < 100 
			? "0" + valueWithNull(millis)
			: millis
	].join('');
	var args = [dateStr];
	for (var key in arguments) {
		args.push(arguments[key]);
	}
	console.log.apply(console, args);
}


var db = new sqlite3.Database(DATABASE_NAME);

db.on('profile', function(query, time) {
	// log('executed query (' + time + ' ms): ' + query);
})

var prepareDb = function(afterCallback) {
	var tables = [
		"create table if not exists users ("
			+ "id text, "
			+ "firstname text, "
			+ "lastname text, "
			+ "username text, "
			+ "ischat number, "
			+ "permission integer default 0, "
			+ "points integer default 0 "
		+ ");",
		"create table if not exists words ("
			+ "id integer primary key autoincrement, "
			+ "original text, "
			+ "translation text, " 
			+ "original_language text default 'ru', "
			+ "translation_language text default 'en'"
		+ ");",
		"create table if not exists log ( "
			+ "chat_id text, "
			+ "user_id text, "
			+ "word_id integer, "
			+ "date datetime"
		+ ");",
		"create table if not exists words_definitions (id integer primary key, word text, definitions text);"
	];

	var count = 0, totalCount = tables.length;
	var callback = function() {
		if (++count == totalCount) {
			afterCallback();
		}
	}

	for (var i = 0; i < tables.length; i++) {
		db.run(tables[i], [], callback);
	}
}

function parseData(buffer) {
	var data = JSON.parse(buffer);
	if (typeof data == "object" && 'message' in data && 'text' in data.message) {				
		var text = data.message.text;
		var piecies = text.split(/\s+/);
		data['command'] = piecies[0].slice(1);
		piecies.shift();
		data['args'] = piecies;
		data['usertext'] = piecies.join(' ');
		return data;
	} else {
		return null;
	}
}

var quiz = (function() {
	var started = {};

	function generateNewWordByTranslation(chatId) {
		db.get("select * from words order by random() limit 1", [], function(err, row) {
			if (err) {
				log(err);
				started[chatId] = null;
				bot.sendMessage(chatId, "something wrong");
			} else if (row) {
				var word = row['original'];
				row['wanted'] = row['translation'];
				started[chatId] = row;
				log("generated word=" + word + " for chatId " + chatId);
				bot.sendMessage(chatId, "напишите перевод (используйте / в начале сообщения) для: " + word);
			}
		});
	}

	function generateNewWordByDefinition(chatId) {
		db.get("select * from words_definitions order by random() limit 1", [], function(error, row) {
			if (error) {
				log(error);
				started[chatId] = null;
				bot.sendMessage(chatId, "something wrong");
			} else {
				var definition = row['definitions'];
				var word = row['word'];
				row['wanted'] = word;
				started[chatId] = row;
				log("generated definition for word=" + word + " for chat=" + chatId);
				var task = definition;
				var hint = [word.charAt(0)];
				for (var i = 1; i < word.length; i++) {
					hint.push("_");
				}
				task += "\nhint: " + hint.join(" ") + "\n(please type / before)";
				bot.sendMessage(chatId, task);
			}
		});
	}

	function generateNewWord(chatId) {
		generateNewWordByDefinition(chatId);
	}

	function saveCorrentAnswer(userId, chatId, wordId) {
		db.run("insert into log (chat_id, user_id, word_id, date) values (?, ?, ?, date('now'))",
			[chatId, userId, wordId]);
	}

	return {
		'start': function(chatId) {
			generateNewWord(chatId);
		}, 
		'stop': function(chatId) {
			started[chatId] = false;
		},
		'check': function(message, chatId, userId) {
			if (started[chatId]) {
				var matches = /\/\s{0,}(.+?)$/.exec(message);
				if (matches) {
					var answer = matches[1].toLowerCase();
					log(answer, started[chatId]);

					var result;
					if (started[chatId]['wanted'] != answer) {
						result = "wrong: " + answer;
					} else {
						result = "correct: " + answer;
						saveCorrentAnswer(userId, chatId, started[chatId]['id']);
						started[chatId] = false;
						generateNewWord(chatId);
					}
					bot.sendMessage(chatId, result);
				}
			}
		}
	}
}())

function processCommand(data) {
	log('processCommand ' + data['command']);
	var chatId = data['message']['chat']['id'];
	switch (data['command']) {
		case 'start':
			quiz.start(chatId);
			break;
		case 'stop':
			quiz.stop(chatId);
			break;
		case 'ping':
			bot.sendMessage(chatId, "pong");
			break;
		default: 
			quiz.check(data['message']['text'], chatId);
			break;
	}
}

function saveUser(user, ischat) {
	db.run("insert or replace into users (id, firstname, lastname, username, ischat) "
		+ "values ((select id from users where id = ?), ?, ?, ?, ?)", 
		[user['id'], user['firstname'] || '', user['lastname'] || '', user['username'] || '', ischat ? 1 : 0]);
}


function startServer() {
	log('createServer on port ' + PORT);
	https.createServer(options, function(req, res) {
		log('request received from ' + req['headers']['x-real-ip'] + ' method = ' + req['method']);
		var data = "";
		if (req['method'] == 'POST') {
			req.on('data', function(chunk) {
				data += chunk;
			});
			req.on('end', function() {
				var params = parseData(data);
				if (params) {
					log("receive message: " + params['message']['text'], params['message']['from']);
					saveUser(params['message']['from'], false);
					if (params['message']['chat']['type'] != 'private') {
						saveUser(params['message']['chat'], true);
					}
					processCommand(params);
				} else {
					log('data is empty');
				}
			})
		}
		res.writeHead(200, {"Content-Type": "text/plain"});
		res.write("ok");
		res.end(); 
	}).listen(PORT);	
}

prepareDb(startServer);




