#!/usr/bin/env node

var program = require("commander");
var Handlebars = require("handlebars");
var _ = require("underscore");
var fs = require("fs");

program
    .version("0.2.0")
    .option("-i, --in <file>", "select the input file")
    .parse(process.argv);

if (!program.in)
    program.help();

Handlebars.registerHelper("math", function(lvalue, operator, rvalue, options) {
    lvalue = parseFloat(lvalue);
    rvalue = parseFloat(rvalue);
    return {
        "+": lvalue + rvalue,
        "-": lvalue - rvalue,
        "*": lvalue * rvalue,
        "/": lvalue / rvalue,
        "%": lvalue % rvalue
    }[operator];
});

var loadTemplates = function(callback) {
    var templates = {};
    var fileNames = [ "index", "screen", "image" ];
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
    var name, size, matches;
    var lines = (""+data).split("\n");
    var screens = [];
    var screen = { name: "no", lines: [] };
    lines.forEach(function(line) {

        // Ignore comments
        if (line.match(/^\ *#.*/))
            return;

        // New screen
        matches = line.match(/^\=\=\=\ (.+)\ \=\=\=$/);
        if (matches) {
            name = matches[1];
            screen = {
                name: name,
                lines: [],
                extra: []
            }
            screens.push(screen);
            return;
        }

        // Image
        matches = line.match(/^image\ +(\d+)\ +(.*)/);
        if (matches) {
            size = matches[1];
            name = matches[2];
            screen.extra.push({
                type: "image",
                name: name,
                top: screen.lines.length,
                height: size
            });
            for (var i = 0; i < size; ++i) {
                screen.lines.push("");
            }
            return;
        }

        // Add a line
        screen.lines.push(line);
    });
    return screens;
};

loadTemplates(function(templates) {
    fs.readFile(program.in, function(err, data) {

        var content = [];

        var screens = extractScreens(data);
        var originX = 30;
        var lineH = 29;
        var x = originX;
        var y = 30;
        var id = 0;
        screens.forEach(function(screen) {
            id += 1;
            screen.zOrder = id;
            screen.id = id;
            screen.x = x;
            screen.y = y;
            var linesEncoded = _(screen.lines).map(function(line) {
                return encodeURIComponent(line);
            });
            screen.linesEncoded = linesEncoded.join("%0A");
            screen.nameEncoded = encodeURIComponent(screen.name);

            content.push(templates.screen(screen));

            screen.extra.forEach(function(extra) {
                id += 1;
                extra.x = x;
                extra.y = y;
                extra.zOrder = id;
                extra.id = id;
                if (extra.name)
                    extra.nameEncoded = encodeURIComponent(extra.name);
                extra.top = 109 + lineH + extra.top * lineH;
                extra.height = extra.height * lineH;
                if (templates[extra.type])
                    content.push(templates[extra.type](extra));
            });

            x += 310;
            if (x > 2000) {
                x = originX;
                y += 603;
            }
        });
        var out = templates.index({content: content.join("\n")});
        console.log(out);
    });
});
