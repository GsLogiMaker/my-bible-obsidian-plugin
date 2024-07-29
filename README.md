# My Bible
Your own customizable markdown bible for your personal vault!

![](https://github.com/GsLogiMaker/my-bible-obsidian-plugin/blob/444be699b5a81baddc5453856fc5da9fdadfce02/example.gif)

- Read the Bible from within your Obsidian vault!
- Automatically setup a folder structure for your Bible, which populates with verses as you read it!
- Customize the whole layout to your liking! Folders, names, verses, links, all at your disposal!
- Access different Bible translations from the server, or download them to your local device!
- Link to any verse from your notes! Ex: `[[Genesis 1#1]]`
- Switch to any translation you like without duplicate Bibles or breaking links!
- See how the Bible connects to your thoughts in the Graph View!

Something missing, or needs improvement? [Submit your own ideas here!](https://github.com/GsLogiMaker/my-bible-obsidian-plugin/issues/new)

### Inspiration
I was inspired by Obsidian user [Joschua's](https://joschua.io/) idea of [linking all our notes with scripture](https://notes.joschua.io/60+Outputs/62+Projects/Bible+Study+Kit/Connecting+makes+you+engage+Scripture). He did this by including a copy of the Bible in his vault, with every chapter as one note and each verse as a header within it. I followed his instructions for doing this, and got the Bible in my own vault too, and it's great having the Bible to link to in my vault. I get to see visually how the Bible connects to my studies, my dreams, and more! However, the process was technical, and I don't think I could convince any non-programmer to do this for their own vault. I wanted to change that, so I made My Bible to streamline the process to just a few simple steps, without ever leaving Obsidian.

### How it works
![](https://github.com/GsLogiMaker/my-bible-obsidian-plugin/blob/master/example_gen_01.png?raw=true)

My Bible sets up a folder structure and populates it with one note per chapter. The chapters don't contain the text of the Bible; the text is inserted as you read it, allowing you to have any translation you want, represented by the same file/chapter/note. Because of this, you can easily and quickly switch translations without affecting the links to your Bible!

### Notice
This plugin makes requests to [https://bolls.life/api/](https://bolls.life/api/) to download text and meta-data regarding translations, books, and chapters of the Bible. The plugin does not, itself, contain translations.

### Getting started
1. Download the plugin from the *Community Plugins* list in the Obsidian settings.
2. Activate *My Bible* in the *Community Plugins* tab in *Settings*.
3. Press `ctrl+p` to open the command list, then search for and select the command `Build Bible`.
4. Configure build settings to your liking, then press `Build`.
5. Wait while your Bible is built, then start linking your notes to it!

### Commands
* `Build Bible` - Builds the file structure for the Bible within your vault.
* `Change translation` - Opens a search menu for choosing a new translation for dynamic verses to display.
* `Download translation` - Opens a search menu of translations you can download. Downloaded translations are used only by dynamic verses for access to the Bible while offline.
* `Clear local files` - Removes all local bible files, including downloaded translations.

### Troubleshooting
If you have issues with the plugin [please report them here](https://github.com/GsLogiMaker/my-bible-obsidian-plugin/issues/new).

### Adding translations
I do not directly control which translations are available, because My Bible relies on the Bolls Life API for its translations. However, you can reach the maintainer of Bolls Life [here](https://bolls.life/api/#contact_me).

### Support
If you want to support my work, buy me a coffee! If you want to follow development of My Bible, follow me on [X/Twitter](https://twitter.com/GsLogiMaker).

<a href="https://www.buymeacoffee.com/gslogimake0" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

Enjoy My Bible! God bless!
