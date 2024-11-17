**🚧 ...This page is a work in progress... 🚧**

This page documents the available tags when creating custom formatting in MyBible.

## Chapters: Name format

### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{chapter}`
The numeric order for the current chapter.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.

## Chapters: Body format

### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{chapter}`
The numeric order for the current chapter.
### `{verses}`
All verses of the current chapter combined.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.
### `{chapter_name}`
The name of the current chapter. This can be used to create links to this chapter.
### `{chapter_index}`
The name of the index that maps all the chapters for the current book. This can be used to create links to the index.
### `{last_chapter}`
The numeric order of the previous chapter.
### `{last_chapter_name}`
The name of the previous chapter. This can be used to create links.
### `{last_chapter_book}`
The name of the book that the previous chapter is from. This would be Genesis for chapter 1 of Exodus, but it would be Exodus for chapter 2 of Exodus.
### `{next_chapter}`
The numeric order of the next chapter.
### `{next_chapter_name}`
The name of the next chapter. This can be used to create links.
### `{next_chapter_book}`
The name of the book that the next chapter is from. This would be Exodus for chapter 30 of Genesis, but it would be Genesis for chapter 1 of Genesis.
### `{first_chapter}`
The numeric order of the first chapter.
### `{first_chapter_name}`
The name of the final chapter. This can be used to create links.
### `{final_chapter}`
The numeric order of the final chapter.
### `{final_chapter_name}`
The name of the final chapter. This can be used to create links.

## Verse: Format

### `{verse}`
The numeric order of the current verse. For example, when formatting the verse for *John 3:16*, `{verse}` will be *16*.
### `{verse_text}`
The text of the current verse. If `Build with dynamic verses` is active, this will be a codeblock that dynamicly renders as the verse from the currently selected translation. Otherwise, it will be the static text from the translation you built with.
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{chapter}`
The numeric order for the current chapter.
### `{chapter_name}`
The name of the current chapter. This can be used to create links to this chapter.
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{chapter}`
The numeric order for the current chapter.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.

## Book: Name format
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.

## Book index: Name format
### `{translation}`
The translation your Bible is being built for. Example: `YLT`

## Book element format
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.

## Book index: Body format
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{old_testament}`
The list of links to the books of the Old Testament.
### `{new_testament}`
The list of links to the books of the New Testament.
### `{apocrypha}`
The list of links to the books of the Apocrypha.

## Chapter indexes: Name format
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.

## Chapter indexes: Book element format
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.
### `{chapter}`
The numeric order for the current chapter.
### `{chapter_name}`
The name of the current chapter. This can be used to create links to this chapter.

## Chapter indexes: Body format
### `{translation}`
The translation your Bible is being built for. Example: `YLT`
### `{book}`
The name of the book this chapter is from. If `Abbreviate names` is active, then this will be the abbreviated book name.
### `{order}`
The numeric order for the current book. For example, Genesis is the first book, so it's numeric order is `1`. Is affected by the `Book ordering` setting.
### `{chapter}`
The numeric order for the current chapter.
### `{chapter_name}`
The name of the current chapter. This can be used to create links to this chapter.