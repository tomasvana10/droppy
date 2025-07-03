const {
  getPlayerVantagePoint,
  VANTAGE_POINT_ORIENTATIONS,
  requiresAlignment,
  alignInCenterOfBlock,
  findNextClosestVantagePointWithMacrosSaved,
  goToVantagePoint,
} = require("./position");
const { arrsEqual, getMapInfo, log } = require("./utils");

const recKeys = [
  "key.sprint",
  "key.sneak",
  "key.attack",
  "key.use",
  "key.left",
  "key.right",
  "key.forward",
  "key.back",
  "key.jump",
];
const recording = { val: false };
const executing = { val: false };
const MACRO_DIR = "macros";
const ATTEMPT_NEW_VANTAGE_POINT = true;

const getReverseKeyBindings = () => {
  return new Map([...KeyBind.getKeyBindings().entries()].map(([k, v]) => [v, k]));
};
let reverseKeyBindings = { val: getReverseKeyBindings() };

const enableMouse = () => {
  const sens = GlobalVars.getDouble("dp.mouseSensitivity");
  sens && Client.getGameOptions().getControlOptions().setMouseSensitivity(sens);
};

const disableMouse = () => {
  const opts = Client.getGameOptions().getControlOptions();
  GlobalVars.putDouble("dp.mouseSensitivity", opts.getMouseSensitivity());
  opts.setMouseSensitivity(-1 / 3); // disable mouse
};

const pruneInputs = (arr) => {
  const isYawAndPitch = (arr) => arr.length === 2 && arr.every((n) => typeof n === "number");

  let start = 0,
    end = arr.length - 1;

  while (start < end && isYawAndPitch(arr[start]) && arrsEqual(arr[start], arr[start + 1])) start++;
  while (end > start && isYawAndPitch(arr[end]) && arrsEqual(arr[end], arr[end - 1])) end--;

  return arr.slice(start, end + 1);
};

const exec = (type, map = null, vantagePointDir = null, viaCommand = false) => {
  map ||= getMapInfo().active;
  if (!map) return log("Please manually input a map, as one cannot be detected.", 0xc, !viaCommand);
  if (!vantagePointDir) vantagePointDir = getPlayerVantagePoint().dir;
  if (!vantagePointDir) return log("You are not at a vantage point", 0xc, !viaCommand);
  let flag = true;
  if (requiresAlignment()) {
    flag = false;
    log("You are not aligned. Please run the command again after alignment has been performed.", 0xc, !viaCommand);
    alignInCenterOfBlock();
  }
  Player.getPlayer().lookAt(...VANTAGE_POINT_ORIENTATIONS[vantagePointDir]);
  if (!flag) return "re-aligned";

  if (type === "record") return record(map, vantagePointDir);
  run(map, vantagePointDir, false);
};

const record = (map, vantagePointDir) => {
  const player = Player.getPlayer();

  log(`Started recording macro for ${map}/${vantagePointDir.toUpperCase()}. Press <ESC> to stop recording.`);
  recording.val = true;

  const inputs = [];
  while (recording.val) {
    const input = [];
    KeyBind.getPressedKeys().forEach((key) => {
      const k = reverseKeyBindings.val.get(key.toString());
      if (recKeys.includes(k)) input.push(k);
    });
    input.push(player.getYaw(), player.getPitch());
    inputs.push(input);
    Client.waitTick();
  }

  log("Stopped recording and saved macro.");
  FS.makeDir(`${MACRO_DIR}`);
  FS.makeDir(`${MACRO_DIR}/${map}`);
  FS.open(`${MACRO_DIR}/${map}/${vantagePointDir}.json`).write(JSON.stringify(pruneInputs(inputs)));
};

const run = (map, vantagePointDir, viaCommand = false) => {
  const player = Player.getPlayer();
  const keyBindings = KeyBind.getKeyBindings();

  let inputs;
  try {
    inputs = JSON.parse(FS.open(`${MACRO_DIR}/${map}/${vantagePointDir}.json`).read());
  } catch {
    if (!ATTEMPT_NEW_VANTAGE_POINT) {
      return log(`You have not saved any macros for ${map}/${vantagePointDir}.`, 0xc, !viaCommand);
    } else {
      const closest = findNextClosestVantagePointWithMacrosSaved(map, vantagePointDir);
      if (closest === undefined) return log("Macro runner: Couldn't find a vantage point with macros.", 0xc, !viaCommand);
      log("Pathing to closest vantage point with a macro.", 0xf, !viaCommand);
      return goToVantagePoint(() => exec("run", map, closest[0]), closest);
    }
  }

  log(`Running macro for ${map}/${vantagePointDir.toUpperCase()}`, 0xf, !viaCommand);
  executing.val = true;
  disableMouse();

  for (const input of inputs) {
    for (const key of recKeys) {
      KeyBind.key(keyBindings.get(key), false);
    }
    // let the keys be unbound before exiting
    if (!executing.val) {
      enableMouse();
      return log("Terminated macro execution", 0xf, true);
    }
    const l = input.length;
    player.lookAt(input[l - 2], input[l - 1]);
    for (const key of input.slice(0, -2)) {
      KeyBind.key(keyBindings.get(key), true);
    }
    Client.waitTick();
  }

  for (const key of recKeys) {
    KeyBind.key(keyBindings.get(key), false);
  }

  executing.val = false;
  enableMouse();
};

const tabMenuListener = JsMacros.on(
  "OpenScreen",
  JavaWrapper.methodToJavaAsync((evt) => {
    if (evt.screenName === "Game Menu") {
      recording.val = false;
      reverseKeyBindings.val = getReverseKeyBindings();
    }
  })
);

const macroKeyListener = JsMacros.on(
  "Key",
  true,
  JavaWrapper.methodToJava((evt) => {
    if (
      executing.val &&
      reverseKeyBindings.val.get(evt.key) !== "key.use" &&
      recKeys.includes(reverseKeyBindings.val.get(evt.key))
    )
      evt.cancel();
  })
);

const dpmCmd = Chat.getCommandManager()
  .createCommandBuilder("dpm")
  .literalArg("rec")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      exec("record", null, null, true);
    })
  )
  .quotedStringArg("manualMapInput")
  .executes(
    JavaWrapper.methodToJavaAsync((ctx) => {
      exec("record", ctx.getArg("manualMapInput").replaceAll('"', "").replaceAll(" ", "_"), null, true);
    })
  )
  .wordArg("manualVantagePointInput")
  .suggestMatching("north", "south", "east", "west")
  .executes(
    JavaWrapper.methodToJavaAsync((ctx) => {
      exec(
        "record",
        ctx.getArg("manualMapInput").replaceAll('"', "").replaceAll(" ", "_"),
        ctx.getArg("manualVantagePointInput"),
        true
      );
    })
  )
  .or(0)
  .literalArg("run")
  .executes(
    JavaWrapper.methodToJavaAsync(() => {
      exec("run", null, null, true);
    })
  )
  .quotedStringArg("manualMapInput")
  .executes(
    JavaWrapper.methodToJavaAsync((ctx) => {
      exec("run", ctx.getArg("manualMapInput").replaceAll('"', "").replaceAll(" ", "_"), null, true);
    })
  )
  .wordArg("manualVantagePointInput")
  .suggestMatching("north", "south", "east", "west")
  .executes(
    JavaWrapper.methodToJavaAsync((ctx) => {
      exec(
        "run",
        ctx.getArg("manualMapInput").replaceAll('"', "").replaceAll(" ", "_"),
        ctx.getArg("manualVantagePointInput"),
        true
      );
    })
  );

module.exports = {
  dpmCmd,
  tabMenuListener,
  macroKeyListener,
  exec,
  recording,
  executing,
  enableMouse,
  disableMouse,
  reverseKeyBindings,
  recKeys,
};
