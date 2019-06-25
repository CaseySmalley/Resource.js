/*
	ES5 Compatible module & resource loader
*/

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
		console.log(format_string.apply(null,arguments));
	}

	function warn() {
		console.warn(format_string.apply(null,arguments));
	}

	function error() {
		throw format_string.apply(null,arguments);
	}

	function _class() {
		
	}

	function class_extends() {
		
	}

	function safe_function() {

	}

	function safe_class() {

	}

	function safe_class_extends() {
		
	}

	function _import() {
		if (!arguments.length) {
			error("import, no arguments provided");
		}

		var reload = false;

		for (var i = 0; i < arguments.length - 1; ++i) {
			var key = arguments[i];

			if (typeof(key) !== "string") {
				error("import, argument '%d' must be a string",i);
			} else if (key === "reload") {
				reload = true;
			} else {
				reload = false;
			}
		}
		
		var callback = arguments[i];
		
		if (typeof(callback) !== "function") {
			error("import, last argument must be a function");
		}
	}

	function define() {
		
	}
	
	return {
		format_string: format_string,
		log: log,
		warn: warn,
		error: error,
		class: _class,
		class_extends: class_extends,
		safe_function: safe_function,
		safe_class: safe_class,
		safe_class_extends: safe_class_extends,
		import: _import,
		define: define
	};

}();
