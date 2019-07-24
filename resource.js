var resource = function() {

	"use strict";

	var format_regex = new RegExp("%(?:(.)([0-9]+))?([dbxfcs])","g");
	
	function format_argument(fill,length,type,argument) {
		switch(type) {
			case "d":
				argument = parseInt(argument).toString();
			break;

			case "b":
				argument = parseInt(argument).toString(2);
			break;

			case "x":
				argument = parseInt(argument).toString(16).toUpperCase();
			break;

			case "f":
				argument = parseFloat(argument).toString();

				if (argument.indexOf(".") === -1) {
					argument += ".0";
				}
			break;

			case "c":
				argument = argument[0];
			break;

			case "s":

			break;

			default:
				console.error("format_argument, unsupported format type '" + type + "'");
			break;
		}

		if (fill && length !== NaN && length > argument.length) {
			return fill.repeat(length - argument.length) + argument;
		} else {
			return argument;
		}
	}


	function format_string(string) {
		if (arguments.length === 1) {
			return string;
		}

		format_regex.lastIndex = 0;

		var result = null;
		var format = null;
		var format_fill = null;
		var format_length = null;
		var format_type = null;
		var substring_start = 0;
		var substring_end = 0;
		var i = 1;
		var out = "";

		while((result = format_regex.exec(string))) {
			format = result[0];
			format_fill = result[1];
			format_length = parseInt(result[2]);
			format_type = result[3];
			substring_end = format_regex.lastIndex - format.length;
			
			if (arguments[i] !== undefined) {
				out += string.substring(substring_start,substring_end)
				    +  format_argument(format_fill,format_length,format_type,arguments[i++].toString());
			} else {
				console.error("format_string, missing argument '" + i.toString() + "'");
			}

			substring_start = format_regex.lastIndex;
		}

		return out + string.substring(substring_start,string.length);
	}

	function log() {
		console.log(format_string.apply(undefined,arguments));
	}

	function warn() {
		console.warn(format_string.apply(undefined,arguments));
	}

	function error() {
		throw format_string.apply(undefined,arguments);
	}

	function ajax_onreadystatechange(callback) {
		if (this.readyState === 4) {
			callback(this.status,this.response);
		}
	}

	function ajax(method,mime_type,url,data,callback) {
		var request = new XMLHttpRequest();

		request.onreadystatechange = ajax_onreadystatechange.bind(request,callback);
		request.overrideMimeType(mime_type);
		request.open(method,url,true);
		request.send(data);

		return request;
	}
	
	function Resource_Node(path,request) {
		this.path = path;
		this.request = request;
		this.dependancies = [];
		this.dependants = 1;
		this.blob = undefined;
		this.data = undefined;
		this.callback = undefined;
	}

	var node_map = {};

	function Resource_Request(paths,callback) {
		this.paths = paths;
		this.callback = callback;
	}

	var active_requests = [];

	function check_request_done(request) {
		for (var i = 0; i < request.paths.length; ++i) {
			if (!node_map[request.paths[i]].data) {
				return false;
			}
		}

		return true;
	}

	function get_request_dependancies(request) {
		if (!request.paths.length) {
			return undefined;
		}

		var dependancies = [];
		    dependancies.length = request.paths.length;

		for (var i = 0; i < request.paths.length; ++i) {
			dependancies[i] = node_map[request.paths[i]].data;
		}

		return dependancies;
	}

	function check_active_requests() {
		for (var i = 0; i < active_requests.length; ++i) {
			var request = active_requests[i];
			
			if (check_request_done(request)) {
				active_requests[i] = active_requests[active_requests.length - 1];
				active_requests.pop();
				request.callback.apply(undefined,get_request_dependancies(request));
			}
		}
	}

	var can_define_module_node = undefined;

	function on_module_defined(node,dependancies) {
		node.data = node.callback.apply(node,dependancies);
		check_active_requests();
	}

	function on_module_code_loaded(path,status,code) {
		if (status !== 200) {
			error("failed to load module '%s'",path);
		}

		var node = node_map[path];

		node.blob = new Blob([code],{mime: "text/plain"});
		can_define_module_node = node;
		
		var script = document.createElement("script");

		script.src = URL.createObjectURL(node.blob);

		document.head.appendChild(script);
	}

	function create_module_node(path) {
		node_map[path] = new Resource_Node(
			path,
			ajax(
				"GET",
				"text/plain",
				path,
				undefined,
				on_module_code_loaded.bind(undefined,path)
			)
		);
	}
	
	var import_type_regex = new RegExp("\\.([a-zA-Z0-9_]+)$","");

	function _import_(paths,callback) {
		var processed_paths = [];
		
		for (var i = 0; i < paths.length; ++i) {
			var path = paths[i];
			var type = undefined;
		
			switch(path) {
				case "text":
				case "json":
				case "image":
				case "audio":
				case "video":
				case "css":
				case "module":
					type = path;

					if (++i >= paths.length) {
						error("missing arguments");
					}

					path = paths[i];
				break;
			}
			
			var match = path.match(import_type_regex);

			if (match) {
				switch(match[1]) {
					case "js": type = "module"; break;
				}
			} else {
				type = "module";
				path += ".js";
				paths[i] = path;
			}

			processed_paths.push(path);
			var node = node_map[path];

			if (node) {
				++node.dependants;
			} else {
				switch(type) {
					case "text": break;
					case "json": break;
					case "image": break;
					case "audio": break;
					case "video": break;
					case "css": break;
					case "module": create_module_node(path); break;
					default: break;
				}
			}
		}

		active_requests.push(new Resource_Request(processed_paths,callback));
	}

	function define(paths,callback) {
		if (!can_define_module_node) {
			error("Cannot define module");
		}

		var node = can_define_module_node;

		node.dependancies = paths;
		node.callback = callback;
		can_define_module_node = undefined;

		_import_(paths,on_module_defined.bind(undefined,node));
		check_active_requests();
	}

	return {
		format_string: format_string,
		log: log,
		warn: warn,
		error: error,
		ajax: ajax,
		import: _import_,
		define: define
	};

}();
