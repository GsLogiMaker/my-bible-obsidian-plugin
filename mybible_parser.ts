import { mb } from "api"
import MyBible, { getPlugin, is_alpha, is_alphanumeric, is_numeric } from "main"

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

	async toText(context:any):Promise<string> {
		let text = ""

		if (this.name === "verse") {
			let verse_text = await mb.scripture(
				this.args[""] ?? "1 1 1"
			)
			text += verse_text + await this.contentString(context)

		} else if (this.name === "js") {
			try {
				let result = await getPlugin()
					.runJS(await this.contentString(context), context)
				result = result ?? ""
				text += await result.toString()
			} catch(e) {
				text += "\n> [!ERROR] JS {0}\n{1}\n"
					.format(e.name, e.message)
			}

		} else if (this.name === "randomverse") {
			let seed = String(this.args["seed"])
			let verse_numbers = this.args["versenumbers"] ?? false
			let separator = this.args["separator"] ?? " "
			let translation = this.args["translation"]

			let verse = await mb.randRef(seed)
			verse.setTranslation(translation)
			let verse_text = await mb.scripture(
				verse ?? "1 1 1",
				verse_numbers,
				separator,
			)
			text += verse_text + await this.contentString(context)

		} else {
			text += "> [!ERROR] Tag error\n> Tag `{0}` is not a valid tag\n{1}"
				.format(this.name, await this.contentString(context))

		}
		return text
	}

	async contentString(context:any):Promise<string> {
		let text = ""
		for (const X of this.content) {
			if (X instanceof BBCodeTag) {
				text += await X.toText(context)
			} else {
				text += X
			}
		}
		return text
	}
}

export module legacy {
	class MBCommand {
		keyword: string = ""
		arguments: MBArg[] = []
		call: (args:Record<string, any>, el:HTMLElement, plugin: MyBible) => void
	
		callback(
			c: (args:Record<string, any>, el:HTMLElement, plugin: MyBible) => void
		) {
			this.call = c
			return this
		}
	
		arg(key:string, type:string, default_value:any=undefined) {
			let arg = new MBArg(key, type, default_value)
			this.arguments.push(arg)
			return this
		}
		opitonal_args(args: MBArg[]) {
			this.arguments.concat(args)
			return this
		}
	}
	
	class MBArg {
		key: string = ""
		type: string = ""
		default_value: any = undefined
	
		constructor(key:string, type:string, default_value:any=undefined) {
			this.key = key
			this.type = type
			this.default_value = default_value
		}
	}
	export class VerseParser {
		commands: MBCommand[]
		context: any
	
		constructor() {
			this.commands = []
			this.context = {}
		}
		
		parse(source:string, el:HTMLElement) {
			for (const LINE of source.split("\n")) {
				this.render_verse(LINE, el)
			}
		}
	
		async render_verse(
			line:string,
			el:HTMLElement,
			with_verse_numbers:boolean=true,
		) {
			let div = el.createDiv()
			const ref = line.trim().replace(/[:-]/g, " ").split(" ");
	
			let book:string|null = null;
			let book_id = -1;
			let chapter = -1;
			let verse = -1;
			let verse_end = -1;
			let maybe_translation: string | null = null;
			let i = 0;
	
			while (i != ref.length) {
				// Compose book name
				if (i == 0) {
					// Always add first item, no matter what it is
					book = (book || "") + ref[i];
				} else {
					// Only add items that are words, and not numbers
					if (!is_alpha(ref[i])) {
						break;
					}
					book += " " + ref[i]
				}
	
				i += 1;
			}
			if (is_numeric(book || "")) {
				// Compose book_id
				book_id = Number(book);
				book = null;
			}
	
			if (i != ref.length && is_numeric(ref[i])) {
				// Compose chapter
				chapter = Number(ref[i]);
				i += 1;
			}
	
			if (i != ref.length && is_numeric(ref[i])) {
				// Compose verse
				verse = Number(ref[i]);
				i += 1;
			}
	
			if (i != ref.length && is_numeric(ref[i])) {
				// Compose range
				verse_end = Number(ref[i]);
				i += 1;
			}
	
			if (i != ref.length && is_alphanumeric(ref[i])) {
				// Compose translation
				maybe_translation = ref[i];
				i += 1;
			}
	
			let translation = maybe_translation || getPlugin().settings.reading_translation;
			if (book !== null) {
				book_id = await getPlugin().bible_api
					.book_id(getPlugin().settings._built_translation||translation, book);
			}
			book = (await getPlugin().bible_api.get_book_data(translation, book_id)).name;
			
			let text = "";
			if (book.length === 0) {
				text = "[Book and chapter must be provided]";
			} else if (chapter === -1) {
				text = "[Chapter must be provided]";
			} else if (verse === -1) {
				// Whole chapter
				let verses = await getPlugin().bible_api.get_chapter(
					translation,
					book_id,
					chapter,
				);
				for (const verse_i_ of Object.keys(verses)) {
					const verse_i = Number(verse_i_)
					let verse = verses[verse_i];
					text += "<sup>" + (verse_i) + "</sup> " + verse;
					if (verse_i != Object.keys(verses).length+1) {
						text += " ";
						// text += "<br>";
					}
				}
				if (text.length === 0) {
					text = "<No text found for {1} {0} in translation {2}>"
						.format(String(chapter), book, translation)
				}
			} else if (verse_end < verse) {
				// Single verse
				text = await getPlugin().bible_api.get_verse(
					translation,
					book_id,
					chapter,
					verse,
				)
				if (text.length === 0) {
					text = "<No text found for {1} {0}:{2} in translation {3}>"
						.format(String(chapter), book, String(verse), translation)
				}
			} else {
				// Verse range
				let verses = await getPlugin().bible_api.get_chapter(
					translation,
					book_id,
					chapter,
				);
				let j = verse;
				while (j < verse_end + 1 && j < Object.keys(verses).length) {
					if (with_verse_numbers) {
						text += "<sup>" + j + "</sup> " + verses[j];
						if (j != verse_end) {
							text += "<br>";
						}
					} else {
						text += verses[j] + "<br>"
					}
					j += 1;
				}
				if (text.length === 0) {
					text = "<No text found for {1} {0}:{2}-{3} in translation {4}>"
						.format(String(chapter), book, String(verse), String(verse_end), translation)
				}
			}
	
			let span = div.createSpan({
				text: "",
			});
	
			let tags = text.matchAll(
				/(?:<\s*([\w]*)\s*>([\s\S]*?)<\s*\/\1\s*>)|<\s*(br|\/br|br\/)\s*>|([\s\S]+?(?:(?=<\s*[/\\\w]*\s*>)|$))/g
			);
			for (let match of tags) {
				let tag_type = match[1];
				let tag_text = match[2];
				let lone_tag_type = match[3];
				let normal_text = match[4];
	
				if (normal_text !== undefined) {
					span.createSpan({
						text: normal_text,
					});
				} else if (lone_tag_type === "br") {
					span.createEl(lone_tag_type);
				} else if (lone_tag_type === "br/" || lone_tag_type === "/br") {
					span.createEl("br");
					span.createSpan({
						text: "\n",
					});
				} else if (lone_tag_type === "/J") {
					/* Do nothing */
				} else if (tag_type === "sup") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "sub") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "S") {
					span.createEl(
						"sub",
						{ text: tag_text, attr: { style: "opacity: 0.5" } },
					);
				} else if (tag_type === "i") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "b") {
					span.createEl(tag_type, { text: tag_text });
				} else if (tag_type === "e") {
					/// A quote from from elsewhere in the bible.
					span.createEl("i").createEl("q", { text: tag_text });
				} else {
					span.createSpan(
						{ text: "<{0}>{1}</{0}>".format(tag_type, tag_text) },
					);
				}
			}
		}
	}
}
