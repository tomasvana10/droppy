# droppy

Dropper bot for hypixel

## Supported Minecraft versions

-   `1.19.4`

## Requirements

-   `Fabric`
-   `JSMacros`
-   `Baritone API`

## Installation

1. Download the [Fabric API Installer](https://fabricmc.net/use/installer/) and follow the steps to install `Fabric`.
2. Download the [JSMacros JAR](https://www.curseforge.com/minecraft/mc-mods/jsmacros).
3. Download the [Baritone API](https://github.com/cabaletta/baritone/releases).

4. Place the JARs in your mods folder. This can usually be found in `%APPDATA%/.minecraft/mods` if you are playing Minecraft through the standard launcher.

5. Download [the latest release](https://github.com/tomasvana10/droppy/releases/latest) of `droppy`, then extract it and move it to wherever you wish.
   
6. Launch Minecraft.
   
7. Set a keybind in `Controls` to open the `JSMacros` GUI. By default, this is set to `k`.

8.  In-game, press the keybind to open the GUI and follow these steps:

    1. Click on the `Services` tab.
    2. Click on the `+` button at the top right of the script table.
    3. Give the service a name.
    4. Click on the `./` to change the directory to the script. This can be done by pressing `Open Folder` and selecting to the `droppy` folder you downloaded from this repository.
    5. Select `index.js` as the service script.
        > [!WARNING] Ensure you select the `JavaScript` version of `index` and not the `TypeScript` version.
    6. Enable and run the script by clicking on the two red buttons on the right of the service (`Disabled` -> `Enabled` and `Stopped` -> `Running`).

9.  Enjoy the script.

## To other developers

If you wish to edit and build upon this script for whatever reason, follow these steps.

### Main setup

1. Install NPM [using this guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm).
2. Open a terminal in the toplevel of the `mmhack` folder and run `npm install` to install the required dependencies.
3. Make your changes to `index.ts`, and compile the file using `tsc -b`.

### Autocompletion for the JSMacros libraries

1. Go to the [latest JSMacros release](https://github.com/JsMacros/JsMacros/releases/latest) and download `typescript-main.zip`.
2. Extract the downloaded file, locate `headers/` and drag it into the toplevel of the `droppy` folder.

### Add linting support to your IDE

Download the [ESlint extension for VS Code](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint).
