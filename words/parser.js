var fs = require('fs');
var sqlite3 = require('sqlite3');
var jsdom = require('node-jsdom').jsdom;

var db = new sqlite3.Database('words.db');

db.run('create table if not exists words_definitions (id integer primary key, word text, definitions text);', [], function() {
	console.log(arguments);
	parse();
});

function process(filename, data, callback) {
	var doc = jsdom(data);
	var word = doc.querySelector("h1.dynamictext");	
	if (!word) {
		console.log(filename);
	} else {
		word = word.textContent.trim();
		console.log(word);
		var definitions = doc.querySelectorAll("h3.definition");
		var defs = [];
		for (var i = 0; i < definitions.length; i++) {
			var definition = definitions[i];
			definition.getElementsByTagName("a")[0].innerHTML = "";
			defs.push(definition.textContent.trim());
		}
		db.run("insert or replace into words_definitions (id, word, definitions) values "
		+ " ((select id from words_definitions where word = $word), $word, $defs);", 
			{
				$word: word, 
				$defs: defs.join("; ")
			}, 
			function() {
				console.log(arguments);
				callback();
			}
		);
	}
}

function parse() {
	var files = fs.readdirSync(__dirname);
	function check(i) {
		if (i >= files.length) {
			return;
		}
		var filename = files[i];
		if (/randomword.{0,}/.test(filename)) {
			var data = fs.readFileSync(filename);
			process(filename, data, function() {
				check(i + 1);
			});
		} else {
			check(i + 1);
		}
		console.log('' + i + '/' + files.length);
	}
	check(829);
}

