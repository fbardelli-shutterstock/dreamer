var marked = require('marked');
var epilogue = require('epilogue');
var lingo = require('lingo');

var distill = require('./distill');
var Columns = require('./columns');

exports.parse = function(args) {

	args = args || {};
	var input = args.markdown;

	var lexer = new marked.Lexer();
	var tokens = lexer.lex(args.markdown);

	var activeResource;
	var resources = [];

	var routePattern = /(GET|POST|PUT|HEAD|DELETE) (\/.+)/;

	tokens.forEach(function(token, index) {

		var nextToken = tokens[index + 1];

		if (token.type == 'heading' && token.depth == 3) {

			var matches = token.text.match(routePattern);

			if (matches) {

				var method = matches[1];
				var path = matches[2];

				var resource = {
					method: method,
					path: path
				};

				resources.push(resource);
				activeResource = resource;
			}

		} else if (
			activeResource &&
			token.type == 'heading' && token.depth == 6 && token.text == 'Request Parameters' &&
			nextToken.type == 'table'
		) {

			var parameters = [];
			var table = nextToken;

			table.cells.forEach(function(row) {
				var parameter = {};
				row.forEach(function(value, index) {
					parameter[table.header[index]] = value;
				});
				parameters.push(parameter);
			});

			activeResource.requestParameters = parameters;

		} else if (
			activeResource &&
			token.type == 'heading' && token.depth == 6 && token.text == 'Example Response' &&
			nextToken.type == 'code'
		) {
			activeResource.responseTemplate = JSON.parse(nextToken.text);
		}
	});

	return resources;
};

exports.route = function(args) {

	args = args || {};
	var resources = args.resources;
	var models = args.models;
	var app = args.app;

	resources.forEach(function(resource) {

		var resourceModel;
		var components = resource.path.split('/').reverse();

		components.forEach(function(component) {

			if (component.match(/:/)) return;
			if (resourceModel) return;

			if (models[component]) {
				resourceModel = models[component];
			}

		});

		if (components[0].match(/:/)) {
			var actionPlurality = 'singular';
		}

		if (actionPlurality == 'singular') {
			if (resource.method == 'GET') {
				var action = 'read';
			} else if (resource.method.match(/^(POST|PUT|PATCH)$/)) {
				var action = 'update';
			} else if (resource.method == 'DELETE') {
				var action = 'delete';
			}
		} else {
			if (resource.method == 'GET') {
				var action = 'list';
			} else if (resource.method == 'POST') {
				var action = 'create';
			}
		}

		if (!resourceModel) {
			console.warn("couldn't find model for route: " + resource.path);
		}

		var endpoint = resource.path;

		var singularModelName = lingo.en.isSingular(resourceModel.name) ?
			resourceModel.name : lingo.en.singularize(resourceModel.name);

		var pattern = new RegExp("\\/:" + singularModelName + "_id\\b");
		endpoint = endpoint.replace(pattern, '/:id');

		//console.log(resource.method, endpoint, '(' + action + " " + resourceModel.name + ')');

		var controller = new epilogue.Controllers[action]({
			endpoint: endpoint,
			app: app,
			model: resourceModel
		});

		controller.send_before = function(req, res, context) {

			distill(resource.responseTemplate, context.instance);
			context.continue();
		}

		resource.controller = controller;
		resource.model = resourceModel.name;
		resource.action = action;
	});
};
