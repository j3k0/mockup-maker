#!/usr/bin/env node

var program = require("commander");
var Handlebars = require("handlebars");
var _ = require("underscore");
var fs = require("fs");

program
    .version("0.4.1")
    .option("-i, --in <file>", "select the input file")
    .option("-s, --screen <regex>", "only export screens matching regex")
    .option("-x, --section <section>", "output content of given section")
    .option("-f, --flat", "disable screen flow")
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
    var fileNames = [ "index", "screen", "image", "arrow" ];
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

var positionId = function(x,y) { return x + "," + y; };

var allowedOffsetUp = function(positions, x, y) {
    var ret = 0;
    while (true) {
        if (y + ret <= 0) return ret;
        if (positions[positionId(x, y + ret - 1)]) return ret;
        if (positions[positionId(x - 1, y + ret -1)]) return ret;
        ret -= 1;
    }
};

var extractSection = function(data, name) {
    var ret = [];
    var lines = (""+data).split("\n");
    var sectionStarted = false;
    lines.forEach(function(line) {
        if (line == "== " + name + " ==") {
            sectionStarted = true;
            return;
        }
        else if (line.match(/^==.*==$/)) {
            sectionStarted = false;
        }
        if (!sectionStarted) {
            return;
        }
        ret.push(line);
    });
    return ret;
};

var extractScreenFlow = function(data, screens) {
    var lines = (""+data).split("\n");
    var screenFlowStarted = false;
    var flatTree = [];
    var currentLevel = -1;
    var posX = -1;
    var posY = 0;
    var positions = {};
    lines.forEach(function(line) {
        // Ignore comments
        if (line.match(/^\ *#.*/))
            return;
        if (line.match(/^\ *$/))
            return;
        if (line == "== screen flow ==") {
            screenFlowStarted = true;
            return;
        }
        else if (line.match(/^== (.)* ==$/)) {
            screenFlowStarted = false;
        }
        if (line.match(/^=== .* ===$/)) {
            screenFlowStarted = false;
        }
        if (!screenFlowStarted) {
            return;
        }
        var name;
        var level = 0;
        for (var i = 20; i > 0; --i) {
            var rx = "^";
            for (var j = 0; j < i; ++j)
                rx += "  ";
            rx += "(\\w+.*)$";
            var regexp = new RegExp(rx);
            if (line.match(regexp)) {
                level = i;
                name = line.match(regexp)[1];
                break;
            }
        }
        if (level == 0)
            name = line.match(/^(\w+.*)$/)[1];
        if (level <= currentLevel)
            posY += 1;
        posX += level - currentLevel;
        posY += allowedOffsetUp(positions, posX, posY);
        while (positions[positionId(posX, posY)])
            posY += 1;
        currentLevel = level;
        flatTree.push({
            x: posX,
            y: posY,
            level: level,
            name: name
        });
        positions[positionId(posX, posY)] = true;
    });

    /*
    if (flatTree.length == 0) {
        var screens = extractScreens(data);
        for (var i = 0; i < screens.length; ++i) {
            flatTree.push({
                x: i,
                y: 0,
                level: i,
                name: screens[i].name
            });
        }
    }
    */

    // build the tree
    var root = [];
    var stack = [ root ];
    flatTree.forEach(function(row) {
        while (row.level < stack.length - 1)
            stack.pop();
        while (row.level > stack.length - 1) {
            var newList = [];
            stack.push(newList);
            // stack[stack.length-1].push(newList);
        }
        for (var i = 0; i < screens.length; ++i) {
            if (screens[i].name == row.name)
                row.screen = screens[i];
        }
        if (stack.length >= 2) {
            var topList = stack[stack.length-2];
            var parent = topList[topList.length-1];
            row.parent = parent;
        }
        stack[stack.length-1].push(row);
    });

    return {
        root: root,
        flat: flatTree
    }
};

var originX = 30;
var originY = 30;
var lineH = 29;

renderScreen = function(templates, content, screen, id, x, y) {
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
        extra.topPx = 104 + lineH + extra.top * lineH;
        extra.heightPx = extra.height * lineH;
        if (templates[extra.type])
            content.push(templates[extra.type](extra));
    });
    return id;
};

loadTemplates(function(templates) {
    fs.readFile(program.in, function(err, data) {

        if (program.section) {
            console.log(extractSection(data, program.section).join("\n"));
            return;
        }

        var content = [];

        var screens = extractScreens(data);
        var screenFlow = extractScreenFlow(data, screens);
        var x = originX;
        var y = originY;
        var cellMargin = 50;
        var cellWidth = 280;
        var cellHeight = 573;
        var id = 0;

        if (program.flat || screenFlow.root.length == 0) {
            screens.forEach(function(screen) {
                if (program.screen && !screen.name.match(new RegExp("^" + program.screen)))
                    return;
                id = renderScreen(templates, content, screen, id, x, y);
                x += cellWidth + cellMargin;
                if (x > 2000) {
                    x = originX;
                    y += cellHeight + cellMargin;
                }
            });
        }
        else {
            screenFlow.flat.forEach(function(flowItem) {
                var screen = flowItem.screen;
                if (program.screen && !screen.name.match(new RegExp("^" + program.screen)))
                    return;
                id = renderScreen(templates, content, screen, id, flowItem.x * (cellWidth + cellMargin), flowItem.y * (cellHeight + cellMargin));
                // render arrow
                if (flowItem.parent) {
                    var x1 = Math.round(flowItem.x * (cellWidth + cellMargin));
                    var y1 = Math.round(flowItem.y * (cellHeight + cellMargin) + 0.5 * cellHeight);
                    var x0 = Math.round(flowItem.parent.x * (cellWidth + cellMargin) + cellWidth);
                    var y0 = Math.round(flowItem.parent.y * (cellHeight + cellMargin) + 0.5 * cellHeight);
                    if (y1 > y0 + cellHeight) {
                        y0 += Math.round(Math.max(cellHeight * 0.4, cellHeight * (0.25 + 0.05 * (flowItem.y - flowItem.parent.y))));
                        y1 -= Math.round(cellHeight * 0.4);
                    }
                    if (y1 < y0 - cellHeight) {
                        y0 -= Math.round(Math.max(cellHeight * 0.4, cellHeight * (0.25 - 0.05 * (flowItem.y - flowItem.parent.y))));
                        y1 += Math.round(cellHeight * 0.4);
                    }
                    id += 1;
                    if (y1 >= y0) {
                        content.push(templates.arrow({
                            id: id, x0: x0, y0: y0, x1: x1, y1: y1 + 10, down: true
                        }));
                    }
                    else {
                        content.push(templates.arrow({
                            id: id, x0: x0, y0: y0 + 10, x1: x1, y1: y1, up: true
                        }));
                    }
                }
            });
        }

        var out = templates.index({content: content.join("\n")});
        console.log(out);
    });
});
