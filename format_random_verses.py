
from dataclasses import dataclass
import json
import re
from typing import Any

VERSE_RE = r"((?:\d[\s\-_]*)?[A-z]+(?:[\s\-_]+[A-z]+)*)(?:\s*(\d+)(?:\s*:\s*(\d+)(?:\s*\-\s*(\d+))?)?)?"

@dataclass
class Reference:
	book:str = ""
	chapter:int = 0
	verse:int = 0
	verse_end:int|None = 0

	@staticmethod
	def from_tuple(tuple:tuple[Any, ...]) -> "Reference":
		end = None
		if tuple[3] is not None:
			end = int(tuple[3])
		return Reference(str(tuple[0]), int(tuple[1]), int(tuple[2]), end)

[2, 4, 6 ,8]

def main() -> None:
	print("open random_verses_source.json")
	with open("random_verses_source.json") as f:
		print("load random_verses_source.json")
		data:list = json.load(f)
	
	print("assemble array")
	array:list[str] = []
	for x in data:
		array.extend(x["verses"])
	array = list(set(array))
	array.sort()

	to_remove:list[int] = []
	for i, verse in enumerate(array):
		if verse.count(":") > 1:
			# Remove references with multiple ranges
			to_remove.append(i)
			continue

		verse_match = re.match(VERSE_RE, verse)
		if verse_match is None:
			continue
		reference = Reference.from_tuple(verse_match.groups())

		if (match := re.search(r"\s*(\d*)-(\d*)", verse)) and match != None:
			if int(match.groups()[1]) - int(match.groups()[0]) > 2:
				to_remove.append(i)
				continue
		match reference:
			case Reference("Proverbs", 7, verse_start) if int(verse_start) > 0:
				# Remove references to Proverbs 7 to avoid awkward verses like
				# "I have spread my couch with carpets of tapestry, with striped cloths
				# of the yarn of Egypt."
				# which are likely not what people want from random verses.
				to_remove.append(i)
				continue
	for i in reversed(to_remove):
		array.pop(i)

	print("open random_verses.json")
	with open("random_verses.json", "w+") as f:
		print("write random_verses.json")
		f.write(json.dumps(array))

if __name__ == "__main__":
	main()