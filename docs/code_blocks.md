---
    title: Code Blocks
---

**🚧 ...This page is a work in progress... 🚧**

# mybible

MyBible provides a custom templating language which resembles BBCode.

***

### `[verse]`
Converts to scriptural text in markdown.

**Usage**
```
    ```mybible
    [verse="Genesis 1:1 WEB"]
    ```
```
**Result**
```
     In the beginning Elohim created the heavens and the earth.
```

***

### `[randomverse]`
Converts to the scriptual text of a random verse in markdown.

**Usage**
```
    ```mybible
    [randomverse seed="10565" separator=" " verseNumbers=true translation="WEB"]
    ```
```

***

### `[js]...[/js]`
Converts to the returned result of running Javascript code.

**Usage**
```
    ```mybible
    [js]this.myValue = "Hello"[/js]
    [js]return this.myValue + " world!"[/js]
   
    ```
```
**Result**
```
     Hello world!
```

# verse

The `verse` codeblock is the simplest way to fetch and render text from the scriptures.

**Example**
```
    ```verse
    Genesis 1:1 WEB
    ```
```

**Result**
```
    In the beginning Elohim created the heavens and the earth.
```