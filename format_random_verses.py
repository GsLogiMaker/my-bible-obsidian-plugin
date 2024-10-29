
import json
import re

print("open output.json")
with open("output.json") as f:
	print("load output.json")
	data = json.load(f)

print("assemble array")
array:list[str] = []
for x in data:
	array.extend(x["verses"])
array = list(set(array))
array.sort()

to_remove:list[int] = []
for i, verse in enumerate(array):
	if verse.count(":") > 1:
		to_remove.append(i)
		continue
	if (match := re.search(r"\s*(\d*)-(\d*)", verse)) and match != None:
		if int(match.groups()[1]) - int(match.groups()[0]) > 2:
			to_remove.append(i)
			continue
	if verse.startswith("Proverbs 7"):
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