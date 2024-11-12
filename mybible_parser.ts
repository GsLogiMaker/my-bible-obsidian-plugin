import { MBInterpreter } from "main"

const ohm = require('ohm-js')

const myBibleGrammar = ohm.grammar(String.raw`
	Arithmetic {
		main = body
		body = (tag | plainText)+
		
		s (whitespace) = space*
		escapedBracket (an escaped bracket)
			= "\\["
		
		string (a string) = "\"" (~"\"" any | "\\\"")* "\""
		number (a number) = ("+" | "-")? digit+ ("." digit*)?
		bool (a boolean) = ("true"|"false")
		value (a value) = string | number | bool
		expression (an expression) = value

		assign (an assignment) = "=" s expression
		
		arg (an argument) = tagName s assign

		tagName (a tag name)
			= (letter | "_") (letter | digit | "_" | "-")*
		openTag<name> (an opening tag)
			= "[" s name (s assign)? (s arg)* s"]"
		closeTag<name> (a closing tag)
			= "[/" s name s "]"

		closedTag<name> (a closed tag)
			= openTag<name> body? closeTag<name>
		unclosedTag<name> (an  unclosed tag)
			= openTag<name> body?
		tagParamaterized<name> (a tag) = closedTag<name> | unclosedTag<name>
		tag (a tag) = tagParamaterized<tagName>

		plainText (plain-text)
			= (escapedBracket | ~"[" any)+
	}
`)
const myBibleSemmantics = myBibleGrammar.createSemantics().addOperation('eval', {
	main(e:any) { return e.eval() },
	body(e:any) { return e.eval() },
	escapedBracket(_:any) {return "["},


	string(_lq:any, content:any, _rq:any) {return content.eval().join("")},
	number(sign:any, num:any, dot:any, deci:any) {return Number(
		sign.sourceString + num.sourceString + deci.sourceString
	)},
	bool(e:any) {
		return e.sourceString.startsWith("f") || Boolean(e.sourceString)
	},
	value(e:any) {return e.eval()},
	expression(e:any) {return e.eval()},

	assign(_0:any, _1:any, v:any) {return v.eval()},

	arg(name:any, _1:any, assign:any) {return {
		name: name.eval(),
		value: assign.eval()
	}},

	tagName(i:any, b:any) { return (i.sourceString + b.sourceString)
		.replace(/[_-]/g, "")
		.toLowerCase()
	},
	openTag(
		_lb:any,
		_1:any,
		tag_name:any,
		_3:any,
		assign:any,
		_5:any,
		args:any,
		_7:any,
		_rb:any,
	) {
		let arg_dict:Record<string, any> = {}
		let assign_value = assign.eval()[0]
		if (assign_value !== undefined) {
			arg_dict[""] = assign_value
		}
		for (const ARG of args.eval()) {
			arg_dict[ARG.name] = ARG.value
		}
		return new BBCodeTag(tag_name.eval(), undefined, arg_dict)
	},
	closeTag(_0:any, _1:any, _2:any, _3:any, _4:any) { return null },
	
	closedTag(_open:any, _content:any, _3:any) {
		let open = _open.eval()
		if (open.name === "js") {
			open["content"] = [_content.sourceString]	
		} else {
			// HACK: Using flat() to remove recursive arrays from _content
			open["content"] = _content.eval().flat()
		}
		console.log(open)
		return open
	},
	unclosedTag(_open:any, _content:any) {
		let open = _open.eval()
		if (open.name === "js") {
			open["content"] = [_content.sourceString]	
		} else {
			// HACK: Using flat() to remove recursive arrays from _content
			open["content"] = _content.eval().flat()
		}
		return open
	},

	tagParamaterized(e:any) { return e.eval() },
	tag(e:any) { return e.eval() },

	plainText(e:any) {
		return e.eval().join("")
	},
	any(e:any) {
		return e.sourceString
	},
	_iter(...children:any) {return children.map((x:any) => x.eval())},
	_terminal() {return null},
})

export function parse_mybible(text:string):(string|BBCodeTag)[] | Error {
	const m = myBibleGrammar.match(text);
	if (!m.succeeded()) {
		let err = new Error(m.message)
		err.name = "Parsing error"
		return err
	}
	return myBibleSemmantics(m).eval()
}

export class BBCodeTag {
	name: string
	content: (string|BBCodeTag)[]
	args: Record<string, any>

	constructor(
		name:string,
		content?:(string|BBCodeTag)[],
		args?:Record<string, any>,
	) {
		this.name = name
		this.content = content ?? []
		this.args = args ?? {}
	}

	async toText(parser:MBInterpreter):Promise<string> {
		let text = ""
		if (this.name === "verse") {
			let verse_text = await parser
				.process_verse_reference(this.args[""] ?? "1 1 1")
			text += verse_text + await this.contentString(parser)
		} else if (this.name === "js") {
			parser.run_js(await this.contentString(parser), {})
		} else if (this.name === "randomverse") {
			let seed = String(this.args["seed"])
			let verse_numbers = this.args["versenumbers"] ?? false
			let separator = this.args["separator"] ?? " "
			let version = this.args["version"]
			let verse = await parser.plugin.bible_api.pick_random_verse(seed)
			let verse_text = await parser.process_verse_reference(
				verse ?? "1 1 1",
				verse_numbers,
				separator,
				version,
			)
			text += verse_text + await this.contentString(parser)
		} else {
			text += "> [!ERROR] Tag error\n> Tag `{0}` is not a valid tag\n{1}"
				.format(this.name, await this.contentString(parser))
		}
		return text
	}

	async contentString(parser:MBInterpreter):Promise<string> {
		let text = ""
		for (const X of this.content) {
			if (X instanceof BBCodeTag) {
				text += await X.toText(parser)
			} else {
				text += X
			}
		}
		return text
	}
}
