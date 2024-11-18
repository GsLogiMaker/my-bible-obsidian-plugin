---
    title: Format Settings
---

This page documents the available tags when creating custom formatting in MyBible.

# Formats

## Chapters :: Name format
Formats names of chapter files.

### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{chapter}`](#chapter)
- [`{order}`](#order)

## Chapters :: Body format
Formats the text body of chapter files.
### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{order}`](#order)
- [`{chapter}`](#chapter)
- [`{chapter_name}`](#chapter_name)
- [`{chapter_index}`](#chapter_index)
- [`{last_chapter}`](#last_chapter)
- [`{last_chapter_name}`](#last_chapter_name)
- [`{last_chapter_book}`](#last_chapter_book)
- [`{next_chapter}`](#next_chapter)
- [`{next_chapter_name}`](#next_chapter_name)
- [`{next_chapter_book}`](#next_chapter_book)
- [`{first_chapter}`](#first_chapter)
- [`{first_chapter_name}`](#first_chapter_name)
- [`{verses}`](#verses)

## Verses :: Format
Formats text for individual verses.
### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{order}`](#order)
- [`{chapter}`](#chapter)
- [`{chapter_name}`](#chapter_name)
- [`{verses}`](#verses)
- [`{verse_text}`](#verse_text)

## Books :: Name format
Formats the names of the book folders.
### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{order}`](#order)

## Book index :: Name format
Formats the name of the book index.
### Supported tags
- [`{translation}`](#translation)

## Book index :: Book element format
Formats each elemenet in the index's book list.
### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{order}`](#order)

## Book index :: Body format
Formats the index's book list for each section (old/new testament) of the bible.
### Supported tags
- [`{translation}`](#translation)
- [`{old_testament}`](#old_testament)
- [`{new_testament}`](#new_testament)
- [`{apocrypha}`](#apocrypha)


## Chapter indexes :: Name format
Formats the names of the chapter indexes.
### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{order}`](#order)

## Chapter indexes :: Chapter element format
Formats each element in the indexs' chapter lists.
### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{order}`](#order)
- [`{chapter}`](#chapter)
- [`{chapter_name}`](#chapter_name)

## Chapter indexes :: Body format
Formats the contents of the chapter indexes.
### Supported tags
- [`{translation}`](#translation)
- [`{book}`](#book)
- [`{order}`](#order)
- [`{chapter}`](#chapter)
- [`{chapter_name}`](#chapter_name)

# Tags

## `{translation}`
The translation your Bible is being built for.
## `{book}`
The name of the current book. If `Abbreviate names` is active, then this will be the abbreviated book name.
## `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.
## `{chapter}`
The numeric order for the current chapter.
## `{chapter_name}`
The name of the current chapter. This can be used to create links to this chapter.
## `{last_chapter}`
The numeric order of the previous chapter.
## `{last_chapter_name}`
The name of the previous chapter. This can be used to create links.
## `{last_chapter_book}`
The name of the book that the previous chapter is from. This would be Genesis for chapter 1 of Exodus, but it would be Exodus for chapter 2 of Exodus.
## `{next_chapter}`
The numeric order of the next chapter.
## `{next_chapter_name}`
The name of the next chapter. This can be used to create links.
## `{next_chapter_book}`
The name of the book that the next chapter is from. This would be Exodus for chapter 30 of Genesis, but it would be Genesis for chapter 1 of Genesis.
## `{first_chapter}`
The numeric order of the first chapter.
## `{first_chapter_name}`
The name of the final chapter. This can be used to create links.
## `{final_chapter}`
The numeric order of the final chapter.
## `{final_chapter_name}`
The name of the final chapter. This can be used to create links.
## `{chapter_index}`
The name of the index that maps all the chapters for the current book. This can be used to create links to the index.
## `{verses}`
The text of all verses of the current chapter combined.
## `{old_testament}`
The list of links to the books of the Old Testament.
## `{new_testament}`
The list of links to the books of the New Testament.
## `{apocrypha}`
The list of links to the books of the Apocrypha.