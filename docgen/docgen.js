
var rsvp = require('rsvp');
var fs = require('fs');
var cheerio = require('cheerio');
var marked = require('marked');
var moment = require('moment');
var ncp = require ('ncp');
var child_process = require("child_process");

/*
    wkthmltopdf option
*/

/*
--header-html "'+File.dirname(__FILE__)+'/temp_header.html"'
--footer-html "'+File.dirname(__FILE__)+'/temp_footer.html"'
 cover "'+File.dirname(__FILE__)+'/temp_cover.html"
*/

var wkhtmltopdfOptions = [
    ' --zoom 0.7297',
    ' --image-quality 100',
    ' --print-media-type',
    ' --orientation portrait',
    ' --page-size A4',
    ' --margin-top 25',
    ' --margin-right 15',
    ' --margin-bottom 25',
    ' --margin-left 15',
    ' --header-spacing 5',
    ' --footer-spacing 5',
    ' toc',
    ' --toc-header-text "Table of Contents"'
];

/**
* DocGen class
*/

function DocGen (options)
{
    var options = options;
    var templates = {};
    var meta = {};
    var pages = {};

    /*
        call wkhtmltopdf as an external executable
    */

    var generatePdf = function () {
        var allPages = '';
        meta.contents.forEach( function (section) {
            section.links.forEach( function (page) {
                var key = page.src;
                var name = key.substr(0, page.src.lastIndexOf('.'));
                var path = options.output+'/'+name+'.html';
                allPages += ' '+path;
            });
        });
        var command = 'wkhtmltopdf';
        command += wkhtmltopdfOptions.join('');
        command += allPages;
        command += ' '+options.output+'/user-guide.pdf';

        var child = child_process.exec(command, function (error, stdout, stderr) {
            if (error) {
                //console.log(error);
            } else if (stderr) {
                //console.log(stderr);
            }
        });
    }

    /*
        read any file
    */

    var readFile = function (path) {
        return new rsvp.Promise(function (resolve, reject) {
            fs.readFile (path, 'utf8', function (error, data) {
                if (error) {
                    reject(error);
                }
                resolve(data);
            });
        });
    }

    /*
        write any file
    */

    var writeFile = function (path, data) {
        return new rsvp.Promise(function (resolve, reject) {
            fs.writeFile(path, data, function (error) {
                if (error) {
                    reject(error);
                } else {
                    resolve(true);
                }
            });
        });
    }

    /*
        load all HTML template files
    */

    var loadTemplates = function () {
        var files = {
            main: readFile('docgen/templates/main.html'),
        };
        rsvp.hash(files).then(function(files) {
            for (var key in files) {
                if (files.hasOwnProperty(key)) { //ignore prototype
                    var file = files[key].replace(/^\uFEFF/, ''); //remove BOM, if present
                    var dom = cheerio.load(file);
                    templates[key] = dom;
                }
            }
            loadMeta();
        }).catch(function(error) {
            console.log(error);
        });
    }

    /*
        load all metadata files (JSON)
    */

    var loadMeta = function () {
        var files = {
            parameters: readFile(options.input+'/parameters.json'),
            contents: readFile(options.input+'/contents.json'),
        };
        rsvp.hash(files).then(function(files) {
            for(var key in files) {
                if (files.hasOwnProperty(key)) { //ignore prototype
                    try{
                        //todo - validate json against a schema
                        var result = JSON.parse(files[key]);
                        meta[key] = result;
                    } catch (error) {
                        console.log(error);
                    }
                }
            }
            loadMarkdown();
        }).catch(function(error) {
            console.log(error);
        });
    }

    /*
        load all markdown files (source)
    */

    var loadMarkdown = function () {
        var keys = [];
        var files = [];
        meta.contents.forEach( function (section) {
            section.links.forEach( function (page) {
                keys.push(page.src);
                files.push(options.input+'/'+page.src);
            });
        });
        rsvp.all(files.map(readFile)).then(function (files) {
            files.forEach( function (page, index) {
                try{
                    var html = marked(page);
                    var key = keys[index];
                    pages[key] = html;
                } catch (error) {
                    console.log(error);
                }
            });
            process(); 
        }).catch(function(error) {
            console.log(error);
        });
    }

    /*
        build the HTML for the table of contents
    */

    var webToc = function () {
        var $ = templates.main;
        var html = [], i = -1;
        html[++i] = '<div><table><tr>';
        meta.contents.forEach( function (section) {
            html[++i] = '<td class="toc-group"><ul><li class="toc-heading">'+section.heading+'</li>';
            section.links.forEach( function (page) {
                var name = page.src.substr(0, page.src.lastIndexOf('.'));
                var path = name+'.html';
                html[++i] = '<li><a href="'+path+'">'+page.title+'</a></li>';
            });
            html[++i] = '</li></ul></td>';
        });
        //fixed-width column at end
        html[++i] = '<td class="toc-group" id="toc-fixed-column"><ul>';
        html[++i] = '<li><span class="w-icon toc-icon" data-name="person_group" title="archive"></span><a href="ownership.html">Ownership</a></li>';
        html[++i] = '<li><span class="w-icon toc-icon" data-name="refresh" title="archive"></span><a href="change-log.html">Release Notes</a></li>';
        html[++i] = '</ul><div>';
        html[++i] = '<button class="w-icon-button" onclick="window.location=\'user-guide.pdf\';">';
        html[++i] = '<span class="w-icon" data-name="document"></span>';
        html[++i] = '<span>PDF copy</span>';
        html[++i] = '</button></div></td>';
        html[++i] = '</tr></table></div>';
        $('#toc').html(html.join(''));
        templates.main = $;
    }

    /*
        insert the parameters into the template
    */

    var insertParameters = function () {
        var $ = templates.main;

        var timestamp = moment().format('DD/MM/YYYY HH:mm:ss');
        var year = moment().format('YYYY');

        $('#name').text(meta.parameters.name);
        if (meta.parameters.version !== '') {
            $('#version').text(' ('+meta.parameters.version+')');
            $('#version-date').text('Version '+meta.parameters.version+' generated '+timestamp);
        } else {
            $('#version-date').text('Generated '+timestamp);
        }
        $('#year').text(year);
        $('#organization').text(meta.parameters.organization);
        $('#legalese').text(meta.parameters.legalese);
        $('#attribution').text('Created by DocGen version '/*+options.version*/);
    }

    /*
        process each input into an output
    */

    var process = function () {
        webToc();
        insertParameters();
        meta.contents.forEach( function (section) {
            section.links.forEach( function (page) {
                var $ = cheerio.load(templates.main.html()); //todo - better implementation of clone?
                var key = page.src;
                var content = pages[key];
                $('#content').html(content);
                pages[key] =  $;
            });
        });
        writePages();
    }

    /*
        write each html page
    */

    var writePages = function () {
        var promises = {};
        meta.contents.forEach( function (section) {
            section.links.forEach( function (page) {
                var key = page.src;
                var name = key.substr(0, page.src.lastIndexOf('.'));
                var path = options.output+'/'+name+'.html';
                var html = pages[key].html();
                promises[key] = writeFile(path, html);
            });
        });
        rsvp.hash(promises).then(function (files) {
            copyRequire();
            copyUserFiles();
            generatePdf();
        }).catch(function(error) {
            console.log(error);
        });
    }

    /*
        copy the require directory (CSS, JavaScript)
    */

    var copyRequire = function () {
        ncp('docgen/require', options.output+'/require', function (error) {
            if (error) {
                console.error(err);
            }
        });
    }

    /*
        copy the files directory (user attached files)
    */

    var copyUserFiles = function () {
        ncp(options.input+'/files', options.output+'/files', function (error) {
            if (error) {
                console.error(err);
            }
        });
    }

    this.run = function () {
        loadTemplates();
    }
}

module.exports = DocGen;
