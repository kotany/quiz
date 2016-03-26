var fs = require('fs');
var sqlite3 = require('sqlite3');

var DATABASE_NAME = 'englishvinglish.db';

var db = new sqlite3.Database(DATABASE_NAME);
db.on('profile', function(query, time) {
	// console.log(time, query);
});


var lines = fs.readFileSync('words.txt').toString().split("\r\n");

var stmt = db.prepare("insert into words (original, translation) values (?, ?)");

for (var i = 0; i < lines.length; i += 2) {
	var original = lines[i + 1].replace("\t", " ");
	var translation = lines[i].replace("\t", " ");
	console.log(i, original, translation);
	stmt.run([original, translation]);
}