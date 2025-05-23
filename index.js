const { Config } = require("./config");
const { dpmCmd, tabMenuListener, exec, recording, executing } = require("./macro");
const {
  getPlayerVantagePoint,
  goToVantagePoint,
  findNextClosestVantagePointWithMacrosSaved,
  baritoneSettings,
} = require("./position");
const { getMapInfo, isDropperGame, nearPortal, log } = require("./utils");

let currentMap = null;
let justResetWithRedstone = false;
let disregardPlayerPositionLookPacket = false;
const playerJoinGameRegex = /[\w\d_]+ has joined \(\d+\/\d+\)\!/;

const jump = (viaCommand = false) => {
  const callback = () => {
    const vantagePoint = getPlayerVantagePoint();
    if (!vantagePoint) return log("Couldn't find a vantage point", 0xc, !viaCommand);
    log(`Jumping from ${vantagePoint.toUpperCase()} vantage point`, 0xf, !viaCommand);
    const res = exec("run", currentMap, vantagePoint, false);
    if (res === "re-aligned") {
      log("Automatically re-executing as this is out of macro recording context", 0xf, true);
      exec("run", currentMap, vantagePoint, false);
    }
  };
  const res = goToVantagePoint(callback, findNextClosestVantagePointWithMacrosSaved(currentMap) ?? null);
  if (!res) {
    log("Trying again as world may not have been fully loaded", 0xf, true);
    Client.waitTick(2);
    goToVantagePoint(callback, findNextClosestVantagePointWithMacrosSaved(currentMap) ?? null);
  }
};

const recvMessageListener = JsMacros.on(
  "RecvMessage",
  JavaWrapper.methodToJava((evt) => {
    const txt = evt.text.getStringStripFormatting();
    if (txt === "DROP!" && Config.LOCAL.autoJump) {
      jump();
    } else if (txt.match(playerJoinGameRegex)) {
      currentMap = null;
    } else if (txt.match(/Drop to the bottom of the map and/)) {
      disregardPlayerPositionLookPacket = true;
      JavaWrapper.methodToJavaAsync(() => {
        Time.sleep(3000);
        disregardPlayerPositionLookPacket = false;
      }).run();
    } else if (txt.match(/^You finished all maps in /) && Config.LOCAL.autoPlay) {
      disregardPlayerPositionLookPacket = true;
      executing.val = false;
      recording.val = false;
      Chat.say("/play arcade_dropper");
      disregardPlayerPositionLookPacket = false;
    }
  })
);

const failListener = JsMacros.on(
  "RecvPacket",
  JsMacros.createEventFilterer("RecvPacket").setType("PlayerPositionLookS2CPacket"),
  JavaWrapper.methodToJavaAsync(() => {
    if (
      currentMap &&
      !recording.val &&
      !justResetWithRedstone &&
      !disregardPlayerPositionLookPacket &&
      Config.LOCAL.autoJump
    ) {
      executing.val = false;
      Client.waitTick(3);
      jump();
    }
    justResetWithRedstone = false;
  })
);

const tickListener = JsMacros.on(
  "Tick",
  JavaWrapper.methodToJavaAsync(() => {
    const mapInfo = getMapInfo();
    if (!mapInfo.active || !isDropperGame()) {
      currentMap = null;
      return;
    }

    if (nearPortal()) {
      disregardPlayerPositionLookPacket = true;
      JavaWrapper.methodToJavaAsync(() => {
        Time.sleep(2000);
        disregardPlayerPositionLookPacket = false;
      }).run();
    }

    const priorMap = currentMap;
    currentMap = mapInfo.active;
    if (priorMap && currentMap && priorMap !== currentMap && Config.LOCAL.autoJump) {
      recording.val = false;
      executing.val = false;
      Client.waitTick(10);
      jump();
    }
  })
);

const keyListener = JsMacros.on(
  "Key",
  JavaWrapper.methodToJavaAsync((evt) => {
    if (
      evt.key === "key.mouse.right" &&
      evt.action &&
      Player.getPlayer().getMainHand().getItemId() === "minecraft:redstone"
    ) {
      justResetWithRedstone = true;
      executing.val = false;
      recording.val = false;
    }
  })
);

const mainCmd = Chat.getCommandManager()
  .createCommandBuilder("dp")
  .executes(JavaWrapper.methodToJavaAsync(() => Chat.say("/play arcade_dropper")))
  .literalArg("jump")
  .executes(JavaWrapper.methodToJavaAsync(jump))
  .or(0)
  .literalArg("jumpStop")
  .executes(
    JavaWrapper.methodToJava(() => {
      executing.val = false;
    })
  )
  .or(0)
  .literalArg("fixBaritone")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      baritoneSettings["allowBreak"].value = false;
      baritoneSettings["allowSprint"].value = true;
      baritoneSettings["echoCommands"].value = false;
      baritoneSettings["avoidance"].value = true;
    })
  )
  .or(0)
  .literalArg("config")
  .literalArg("autoPlay")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      const val = !Config.LOCAL.autoPlay;
      Config.set("autoPlay", val);
      log(`Autoplay toggled to ${val}`);
    })
  )
  .or(2)
  .literalArg("autoJump")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      const val = !Config.LOCAL.autoJump;
      Config.set("autoJump", val);
      log(`Autojump toggled to ${val}`);
    })
  )
  .or(2)
  .literalArg("verbose")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      const val = !Config.LOCAL.verbose;
      Config.set("verbose", val);
      log(`Verbose toggled to ${val}`);
    })
  )
  .register();
dpmCmd.register();

Config.initLocal();
log("Script enabled. Please run /dp fixBaritone to ensure the script works properly.");

event.stopListener = JavaWrapper.methodToJava(() => {
  executing.val = false;
  recording.val = false;

  JsMacros.off(recvMessageListener);
  JsMacros.off(tabMenuListener);
  JsMacros.off(tickListener);
  JsMacros.off(failListener);
  JsMacros.off(keyListener);
  mainCmd.unregister();
  dpmCmd.unregister();
});
