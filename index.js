const { Config } = require("./json");
const { dpmCmd, tabMenuListener, exec, recording, executing, macroKeyListener, enableMouse } = require("./macro");
const {
  getPlayerVantagePoint,
  goToVantagePoint,
  findNextClosestVantagePointWithMacrosSaved,
  baritoneSettings,
} = require("./position");
const { getMapInfo, isDropperGame, nearPortal, log, areNearbyChunksLoaded, forcedActiveMap } = require("./utils");

let currentMap = null;
let justResetWithRedstone = false;
let disregardPlayerPositionLookPacket = false;
let lastPlayerPositionLookPacketCaptureTime = 0;
let tryRegularJumpIfAvoidPreJump = false;
let initialJumpCompleted = false;
let preventErroneousJump = false;
let enteringNewGame = false;
let runningQuickJump = false;
const playerJoinGameRegex = /[\w\d_]+ has joined \(\d+\/\d+\)\!/;

const jump = (viaCommand = false) => {
  const callback = () => {
    const vantagePoint = getPlayerVantagePoint();
    if (!vantagePoint) {
      forcedActiveMap.val = null;
      return log("Jump: Couldn't find a vantage point", 0xc, !viaCommand);
    }
    log(`Jumping from ${vantagePoint.dir.toUpperCase()} vantage point`, 0xf, !viaCommand);
    const res = exec("run", currentMap, vantagePoint.dir, false);
    if (res === "re-aligned") {
      log("Automatically re-executing as this is out of macro recording context.", 0xf, true);
      exec("run", currentMap, vantagePoint.dir, false);
    }
    forcedActiveMap.val = null;
    runningQuickJump = false;
  };
  let res;
  try {
    res = goToVantagePoint(callback, findNextClosestVantagePointWithMacrosSaved(currentMap) ?? null);
  } catch {
    res = null;
  }
  if (!res) {
    log("Trying again as world may not have been fully loaded.", 0xf, true);
    Client.waitTick(2);
    goToVantagePoint(callback, findNextClosestVantagePointWithMacrosSaved(currentMap) ?? null);
  }
};

const newGame = () => {
  disregardPlayerPositionLookPacket = true;
  enteringNewGame = true;
  executing.val = false;
  recording.val = false;
  enableMouse();
  Chat.say("/play arcade_dropper");
  JavaWrapper.methodToJavaAsync(() => {
    Time.sleep(3000);
    disregardPlayerPositionLookPacket = false;
    enteringNewGame = false;
  }).run();
};

const recvMessageListener = JsMacros.on(
  "RecvMessage",
  JavaWrapper.methodToJava((evt) => {
    const txt = evt.text.getStringStripFormatting();

    /**
     * Door is about to open, so do a pre-jump if it is enabled.
     */
    if (txt.match(/^The door opens in 1 second!/) && Config.LOCAL.autoJump && Config.LOCAL.preJump) {
      const vantagePoint = getPlayerVantagePoint();
      if (!vantagePoint) {
        tryRegularJumpIfAvoidPreJump = true;
        return log(
          "Avoiding a pre-jump as you are either not at a vantage point or are too close to the center.",
          0xf,
          true
        );
      }
      const maxOffset = Math.max(...vantagePoint.pos.map(Math.abs));
      if (maxOffset <= 2) return (tryRegularJumpIfAvoidPreJump = true);
      JavaWrapper.methodToJavaAsync(() => {
        Time.sleep(maxOffset === 3 ? 500 : 350); // kind of arbitrary
        jump();
        initialJumpCompleted = true;
        preventErroneousJump = false;
      }).run();
      /**
       * If the door has just opened, and the user has auto-jump on OR a pre-jump couldn't be performed, then jump.
       */
    } else if (txt === "DROP!" && (tryRegularJumpIfAvoidPreJump || (Config.LOCAL.autoJump && !Config.LOCAL.preJump))) {
      tryRegularJumpIfAvoidPreJump &&= false;
      jump();
      initialJumpCompleted = true;
      preventErroneousJump = false;
      /**
       * Just a way of ensuring the current map is wiped when in a pregame lobby to prevent automatically jumping
       * on game start (as the map will change).
       */
    } else if (txt.match(playerJoinGameRegex)) {
      currentMap = null;
      tryRegularJumpIfAvoidPreJump = false;
      preventErroneousJump = false;
      forcedActiveMap.val = null;
      /**
       * This message indicates that the script will soon respond to a PlayerPositionLookS2C packet, which normally means the player
       * died, but in this case, they just spawned in. So, toggle the flag.
       */
    } else if (txt.match(/Drop to the bottom of the map and/)) {
      initialJumpCompleted = false;
      preventErroneousJump = true;
      disregardPlayerPositionLookPacket = true;
      JavaWrapper.methodToJavaAsync(() => {
        Time.sleep(3000);
        disregardPlayerPositionLookPacket = false;
      }).run();
      /**
       * Player is done with the game, start a new one if auto-play is enabled.
       */
    } else if (txt.match(/^You finished all maps in /) && Config.LOCAL.autoPlay) {
      newGame();
    }
  })
);

const failListener = JsMacros.on(
  "RecvPacket",
  JsMacros.createEventFilterer("RecvPacket").setType("PlayerPositionLookS2CPacket"),
  JavaWrapper.methodToJavaAsync(() => {
    /**
     * If `disregardPlayerPositionLookPacket` is true, this likely means the user just began to enter a nether portal,
     * meaning quick jump may be executed.
     */
    const oldPlayerPositionLookPacketCaptureTime = lastPlayerPositionLookPacketCaptureTime;
    lastPlayerPositionLookPacketCaptureTime = World.getTime();
    const mapInfo = getMapInfo();
    Chat.log(
      `disregard: ${disregardPlayerPositionLookPacket}, active: ${mapInfo.active}, isFirst: ${mapInfo.isFirstMap}, initialJumpComplete: ${initialJumpCompleted}, runningBlind: ${runningQuickJump}, next: ${mapInfo.next}`
    );
    Chat.log(`=${World.getTime()}=`);
    if (
      Config.LOCAL.autoJump &&
      // I found that when the difference between the receive times of two of these packets (captured consecutively)
      // is <= 10 ticks, issues can occur like `runningQuickJump` not being set to true in time (no clue how that is possible)
      lastPlayerPositionLookPacketCaptureTime - oldPlayerPositionLookPacketCaptureTime > 10 &&
      disregardPlayerPositionLookPacket &&
      mapInfo.active &&
      (!mapInfo.isFirstMap || initialJumpCompleted) &&
      !runningQuickJump &&
      mapInfo.next
    ) {
      Chat.log("=ENTER=");
      if (preventErroneousJump) return (preventErroneousJump = false);
      Chat.log("=RUN=");
      Client.runOnMainThread(
        JavaWrapper.methodToJava(() => {
          runningQuickJump = true;
          forcedActiveMap.val = mapInfo.next;
          Chat.log(`Setting forced active map to ${forcedActiveMap.val}`);
        })
      );
      JavaWrapper.methodToJavaAsync(() => {
        Time.sleep(250);
        executing.val = false;
        let attempts = 0;
        while (!areNearbyChunksLoaded() && attempts <= 20) {
          Time.sleep(50);
          attempts++;
        }
        Time.sleep(50);
        jump();
      }).run();
    }
    /**
     * This condition checks if the player just died, and runs auto-jump if it is enabled
     */
    if (
      Config.LOCAL.autoJump &&
      mapInfo.active &&
      executing.val &&
      !recording.val &&
      !justResetWithRedstone &&
      !disregardPlayerPositionLookPacket
    ) {
      log("Player death captured", 0xf, true);
      executing.val = false;
      Client.waitTick(3);
      jump();
    }
    /**
     * Since resetting your position with redstone sends the look packet, we can disable the flag variable
     * here as the reset has been complete.
     */
    justResetWithRedstone = false;
  })
);

const checkNearPortal = () => {
  if (nearPortal() && !disregardPlayerPositionLookPacket) {
    runningQuickJump = false;
    disregardPlayerPositionLookPacket = true;
    JavaWrapper.methodToJavaAsync(() => {
      Time.sleep(2000);
      disregardPlayerPositionLookPacket = false;
    }).run();
  }
};

const tickListener = JsMacros.on(
  "Tick",
  JavaWrapper.methodToJavaAsync(() => {
    const mapInfo = getMapInfo();
    if (!mapInfo.active || !isDropperGame()) {
      currentMap = null;
      return;
    }

    /**
     * The player is just about to enter a portal. Entering a portal sends a look packet,
     * but the only purpose of it is to detect deaths. So, the flag must be toggled here to
     * prevent the script from thinking the player just died.
     *
     * Limitations: If the player misses a water skip (a jump performed directly into a portal)
     * the script will not issue a new jump when it should, as it thinks the player entered the portal.
     */
    checkNearPortal();

    JavaWrapper.methodToJavaAsync(() => {
      Time.sleep(25);
      checkNearPortal();
    }).run();

    /*
    const priorMap = currentMap;
    currentMap = mapInfo.active;
    if (priorMap && currentMap && priorMap !== currentMap && Config.LOCAL.autoJump) {
      recording.val = false;
      executing.val = false;
      Client.waitTick(10);
      jump();
    }
    */
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
      log("Resetting with redstone", 0xf, true);
      justResetWithRedstone = true;
      executing.val = false;
      recording.val = false;
      forcedActiveMap.val = null;
    }
  })
);

const mainCmd = Chat.getCommandManager()
  .createCommandBuilder("dp")
  .executes(JavaWrapper.methodToJavaAsync(newGame))
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
      log(`autoPlay is set to ${Config.LOCAL.autoPlay}`);
    })
  )
  .literalArg("toggle")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      const val = !Config.LOCAL.autoPlay;
      Config.set("autoPlay", val);
      log(`autoPlay toggled to ${val}`);
    })
  )
  .or(2)
  .literalArg("autoJump")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      log(`autoJump is set to ${Config.LOCAL.autoJump}`);
    })
  )
  .literalArg("toggle")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      const val = !Config.LOCAL.autoJump;
      Config.set("autoJump", val);
      log(`autoJump toggled to ${val}`);
    })
  )
  .or(2)
  .literalArg("preJump")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      log(`preJump is set to ${Config.LOCAL.preJump}`);
    })
  )
  .literalArg("toggle")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      const val = !Config.LOCAL.preJump;
      Config.set("preJump", val);
      log(`preJump toggled to ${val}`);
    })
  )
  .or(2)
  .literalArg("verbose")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      log(`verbose is set to ${Config.LOCAL.verbose}`);
    })
  )
  .literalArg("toggle")
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
  JsMacros.off(tickListener);
  JsMacros.off(failListener);
  JsMacros.off(keyListener);

  JsMacros.off(tabMenuListener);
  JsMacros.off(macroKeyListener);

  enableMouse();
  mainCmd.unregister();
  dpmCmd.unregister();
});
