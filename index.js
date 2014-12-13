#!/usr/bin/env node

var program = require("commander");
var Handlebars = require("handlebars");
var _ = require("underscore");
var fs = require("fs");

program
    .version("0.0.1")
    .option("-i, --in <file>", "select the input file")
    .parse(process.argv);

if (!program.in)
    program.help();

var loadTemplates = function(callback) {
    var templates = {};
    var fileNames = [ "index", "screen" ];
    var nDone = 0;
    var doneWithFile = function() {
        nDone ++;
        if (nDone === fileNames.length)
            callback(templates);
    };
    var readFile = function(fname) {
    fs.readFile(__dirname + "/templates/" + fname + ".bmml", function(err, data) {
        if (err) {
            console.error("Error loading " + fname);
            console.error(err);
            process.exit(1);
            return;
        }
        templates[fname] = Handlebars.compile("" + data);
        doneWithFile();
    });
    };
    for (var i = 0; i < fileNames.length; ++i) {
        readFile(fileNames[i]);
    }
};

var extractScreens = function(data) {
    var lines = (""+data).split("\n");
    var screens = [];
    var screen = { name: "no", lines: [] };
    lines.forEach(function(line) {
        var matches = line.match(/\=\=\=\ (.+)\ \=\=\=/);
        if (matches) {
            var name = matches[1];
            screen = {
                name: name,
                lines: []
            }
            screens.push(screen);
        }
        else {
            screen.lines.push(line);
        }
    });
    return screens;
};

loadTemplates(function(templates) {
    fs.readFile(program.in, function(err, data) {

        var content = [];

        var screens = extractScreens(data);
        var originX = 30;
        var x = originX;
        var y = 30;
        var id = 1;
        screens.forEach(function(screen) {
            screen.zOrder = id;
            screen.id = id;
            screen.xBg = x;
            screen.yBg = y;
            screen.x = x + 33;
            screen.y = y + 104;
            var linesEncoded = _(screen.lines).map(function(line) {
                return encodeURIComponent(line);
            });
            screen.linesEncoded = linesEncoded.join("%0A");

            content.push(templates.screen(screen));

            id += 1;
            x += 310;
            if (x > 1100) {
                x = originX;
                y += 603;
            }
        });
        var out = templates.index({content: content.join("\n")});
        console.log(out);
    });
});
