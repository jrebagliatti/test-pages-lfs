var assert = require('assert'),
	execSync = require('child_process').execSync,
	fs = require('fs'),
	url = require('url'),
	path = require('path')
//	fileName = '2016-05-19-template.md';
	commitRange = process.env['TRAVIS_COMMIT_RANGE'];

console.log(commitRange);

function GetModifedfiles (commitRange) {
	var cmd = "git diff --name-only"+" "+commitRange
	console.log(cmd);

	var stdout = execSync(cmd);
  	var lines = stdout.toString().split('\n');
	var result = {};

	for (var i = 0; i < lines.length; i += 1) {
		if (lines[i].indexOf(".md")>0) {
			result[lines[i]] = lines[i];
		}    	
  	}
  	return result;
}

function CheckUrlExists(url, callback) {
	var http = require('http'),
		https = require('https');
	var options = {
		method: 'HEAD',
		host: url.host,
		//port: 80,
		path: url.pathname
	};
	var handler = url.protocol == "http:" ? http : https;
	var req = handler.request(options, function (r) {
		// Consider as valid any 1xx, 2xx and 3xx
		callback(r.statusCode < 400, r.statusCode);
	});
	req.end();
}

var ModifiedFilesArray = GetModifedfiles(commitRange);
var PostDirectory = "_posts";
console.log(ModifiedFilesArray);
console.log(Object.keys(ModifiedFilesArray).length);

describe("Check Files modified", function(){
	it("Nomber of modified files", function () {
		if (Object.keys(ModifiedFilesArray).length == 0)	{
			console.log("No files have been modified");			
		}
		else {
			console.log("Several files modified, verifying");
			for(var filePath in ModifiedFilesArray){
				var fileName = ModifiedFilesArray[filePath];
				
				describe("Verifiyng file: " + fileName, function(){
				
					describe("Check Front Matter", function(){
						var contents = fs.readFileSync(fileName, 'UTF8');
						
						describe("Verify presence of tags", function () {
							var mandatoryTags = [
								"layout",
								"title",
								"author",
								"date",
								"color",
								"excerpt"
							]
							
							mandatoryTags.forEach(function(mandatoryTag) {
								it("Front Matter should contain " + mandatoryTag, function(){
									var regex = "---([ \\r\\n\\S]*?)[\\r\\n]((" + mandatoryTag + ": )+)([ \\r\\n\\S]*?)\\s*---";
									var frontmatter = new RegExp(regex);
									assert.ok (frontmatter.test(contents));
								});
							});

							it("Front matter color should be blue", function(){
								var regex = /---([ \r\n\S]*?)[\r\n](color: )(.*)([ \r\n\S]*?)\s*---/;
								var match = regex.exec(contents);
								assert.notEqual(match, null);
								assert.equal(match.length, 5);
								assert.equal(match[3].replace(/["']/g, ""), "blue");
							});
						});

						describe("Verify duplicated URL in permalink", function () {
							// Obtain the current custom URL
							var regex = /---([ \r\n\S]*?)[\r\n]((permalink: )+)(.*?)[\r\n]([ \r\n\S]*?)\s*---/;
							var match = regex.exec(contents);
							if (match != null) {
								assert.equal(match.length, 6, "Current Permalink section is not well formed");
								var currentPermalink = match[4];

								// Look all the md files in the _posts folder:
								var files = fs.readdirSync("./" + PostDirectory);
								files.forEach(file => {
									if (PostDirectory + "/" + file != fileName) {
										it(file + " shouldn't contain a permalink: " + currentPermalink, function(){
											if (file.toLowerCase().endsWith(".md")) {
												var newContents = fs.readFileSync(PostDirectory + "/" + file, 'UTF8');
												var newMatch = regex.exec(newContents);

												if (newMatch && newMatch.length >= 4) {
													var newPermalink = newMatch[4];
													assert.notEqual(newPermalink.replace(/["']/g, ""), currentPermalink.replace(/["']/g, ""));
												}
											}
										});
									}
								});
							} else {
								it(fileName + "doesn't have a permalink set", function(){assert.ok(true);});
							}
						});
					});
					
					describe("Content of the MD file", function(){
						var contents = fs.readFileSync(fileName, 'UTF8');
						describe("Verify mandatory sections", function(){
							var mandatorySections = {
								"Customer Profile": /\s*((## [Cc]ustomer [Pp]rofile ##)+)([\s\S]*?)\s*/,
								"Conclusion": /\s*((## [Cc]onclusion ##)+)([\s\S]*?)\s*/
							}

							Object.keys(mandatorySections).forEach(function(key) {
								it("Verify " + key, function(){
									assert.ok (mandatorySections[key].test(contents));	
								});
							});
						});

						describe("Verify broken image links", function(){
							this.timeout(5000);
							var pattern = /^!\[[^\]]*\]\(([^)]+)\)/gm
							var match = null;
							var imageLinks = [];
							while (match = pattern.exec(contents)) {
								imageLinks.push(match[1]);
							}
							imageLinks.forEach(function(image){
								describe("Image link " + image + " should be valid", function(){
									// Replaces {{site.baseUrl}} by root folder.
									// We can't validate if the image already exists, since the site hasn't been deployed yet.
									// In case the file is in LFS we will get the pointer
									var imageLink = image.replace(/{{(.*)}}/, ".");

									// Check if it's a relative reference to a local image or a link to an external one.
									// To know if it is an external URL, it tries to parse it.
									var imageUrl = url.parse(imageLink);
									if(imageUrl.hostname) {
										it("GET to " + imageLink + " should return 200", function(done){
											CheckUrlExists(imageUrl, function(result, statusCode){
												if (result) {
													done();
												} else {
													done(new Error("Couldn't get the required resource. Response " + statusCode));
												}
											});
										});
									} else {
										it(imageLink + " should exists in the repository", function(){
											var absolutePath;
											if (!(imageLink.startsWith("./") || imageLink.startsWith("/"))) {
												// Relative path
												absolutePath = path.posix.join(path.posix.dirname(fileName), imageLink);
											} else {
												absolutePath = imageLink;
											}
											assert.ok(fs.existsSync(absolutePath), absolutePath + " doesn't exist in repository");
										});
									}
								})
							});
						});

						describe("Verify links", function(){
							this.timeout(5000);
							var pattern = /^\[[^\]]*\]\(([^)]+)\)/gm
							var match = null;
							var links = [];
							while (match = pattern.exec(contents)) {
								links.push(match[1]);
							}
							links.forEach(function(link) {
								//var link = match[1];
								describe("Link " + link + " should be valid", function(){

									// Check if it's an internal (anchor) link or a link to an external link
									if (link.startsWith("#")){
										it("Anchor " + link + " should exist in the document", function(){
											// Look for a heading with that name
											var title = link.replace(/^#/, "").replace("-", " ");
											var regex = new RegExp("^#+\\s*" + title + "\\s*#+", "gmi");

											assert.ok(regex.test(contents), link + " doesn't exist in document");
										});
									} else {
										var linkUrl = url.parse(link);
										if(linkUrl.hostname) {
											it("GET to " + link + " should return 200", function(done){
												CheckUrlExists(linkUrl, function(result, statusCode){
													if (result) {
														done();
													} else {
														done(new Error("Couldn't get the required resource. Response " + statusCode));
													}
												});
											});
										} else {
											it("Links to relative paths can't be validated, since it could not exist", function(){

											});
										}
									}
								});
							});
						});

						// 	it("Verify resources", function () {
						// 	pattern = /\s*((## [Rr]esources ##)+)([\s\S]*?)\s*/
						// 	assert.ok (pattern.test(contents));

						// });
					});
				});
			}
		}

	});	
});

