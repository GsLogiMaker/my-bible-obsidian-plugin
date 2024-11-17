**🚧 ...This page is a work in progress... 🚧**

# mybible

MyBible provides a custom templating language which resembles BBCode.

***

### `[verse]`
Renders a verse in the codeblock.

Usage:
```
    ```mybible
    [verse="Genesis 1:1 WEB"]
    ```
```
Processed result:
```
     In the beginning Elohim created the heavens and the earth.
```

***

### `[randomverse]`
Renders a random verse in the codeblock.

Usage:
```
    ```mybible
    [verseverse seed="10565" separator=" " verseNumbers=true translation="WEB"]
    ```
```

***

### `[js]...[/js]`
Runs Javascript code and renders any returned results.

Usage:
```
    ```mybible
    [js]this.myValue = "Hello"[/js]
    [js]return this.myValue + " world!"[/js]
    ```
```
Processed result:
```
     Hello world!
```

# verse

The `verse` codeblock is deprecated and will be removed in a future version of MyBible.

Example:
```
    ```verse
    Genesis 1:1
    ```
```

Result:
```
    In the beginning [...]
```