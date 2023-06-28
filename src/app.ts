/* ------------------------------ add packages ------------------------------ */
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  GroupMetadata,
  ParticipantAction,
  WAMessage,
  MessageUpsertType,
  makeInMemoryStore,
  GroupParticipant,
} from "@adiwajshing/baileys";

import { Boom } from "@hapi/boom";
import pino from "pino";
import fs from "fs";
import stringSimilarity from "string-similarity";
import NodeCache from "node-cache";

/* ----------------------------- add local files ---------------------------- */
import { dropAuth } from "./db/dropauthDB";
import { getUsernames, setCountMember } from "./db/countMemberDB";
import { setCountVideo } from "./db/countVideoDB";
import { getDisableCommand } from "./db/disableCommandDB";
import { storeAuth, fetchAuth } from "./db/authDB";
import { addUnknownCmd } from "./db/addUnknownCmdDB";

import { LoggerBot, LoggerTg } from "./functions/loggerBot";

import addCommands from "./functions/addCommands";
import memberAddCheck from "./functions/memberAddCheck";
import addDefaultMilestones from "./functions/addDefaultMilestone";
import forwardSticker from "./functions/forwardSticker";
import countRemainder from "./functions/countRemainder";

import { prefix, pvxgroups } from "./constants/constants";
import { MsgInfoObj } from "./interface/msgInfoObj";
import getGroupAdmins from "./functions/getGroupAdmins";
import { Bot } from "./interface/Bot";

import "dotenv/config";
import pvxFunctions from "./functions/pvxFunctions";

const { myNumber, pvx, isStickerForward } = process.env;
const myNumberWithJid = `${myNumber}@s.whatsapp.net`;

const stats = {
  started: "",
  totalMessages: 0,
  textMessage: 0,
  stickerMessage: 0,
  imageMessage: 0,
  videoMessage: 0,
  documentMessage: 0,
  otherMessage: 0,
  commandExecuted: 0,
  stickerForwarded: 0,
  stickerNotForwarded: 0,
  memberJoined: 0,
  memberLeft: 0,
};
stats.started = new Date().toLocaleString("en-GB", {
  timeZone: "Asia/kolkata",
});

let startCount = 1;
let dateCheckerInterval: NodeJS.Timeout;

let milestones = {};

const cache = new NodeCache();
const msgRetryCounterCache = new NodeCache();

const silentLogs = pino({ level: "silent" }); // to hide the chat logs
// let debugLogs = pino({ level: "debug" });

const useStore = false;
// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
const store = useStore ? makeInMemoryStore({ logger: silentLogs }) : undefined;
if (store) {
  store.readFromFile("./baileys_store_multi");
  setInterval(() => {
    store.writeToFile("./baileys_store_multi");
  }, 10_000);
}

// try {
//   fs.rmSync("./auth_info_multi", { recursive: true, force: true });
//   console.log("Local auth_info_multi file deleted.");
//   // fs.unlinkSync("./auth_info_multi.json");
// } catch (err) {
//   console.log("Local auth_info_multi file already deleted.");
// }

const startBot = async () => {
  console.log(`[STARTING BOT]: ${startCount}`);
  await LoggerTg(`[STARTING BOT]: ${startCount}`);
  try {
    const { state, saveCreds } = await useMultiFileAuthState(
      "./auth_info_multi"
    );

    const {
      commandsPublic,
      commandsMembers,
      commandsAdmins,
      commandsOwners,
      allCommandsName,
    } = await addCommands();
    clearInterval(dateCheckerInterval);

    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`using WA v${version.join(".")}, isLatest: ${isLatest}`);

    // Fetch login auth
    const { cred, authRowCount } = await fetchAuth(state);
    if (authRowCount !== 0) {
      state.creds = cred.creds;
    }

    const bot: Bot = makeWASocket({
      version,
      logger: silentLogs,
      printQRInTerminal: true,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silentLogs),
      },
      msgRetryCounterCache,
      generateHighQualityLinkPreview: true,
      shouldIgnoreJid: (jid: string) => isJidBroadcast(jid),
    });

    store?.bind(bot.ev);

    if (pvx) {
      dateCheckerInterval = await pvxFunctions(bot);
    }

    let botNumberJid = bot.user ? bot.user.id : ""; // '1506xxxxx54:3@s.whatsapp.net'
    botNumberJid =
      botNumberJid.slice(0, botNumberJid.search(":")) +
      botNumberJid.slice(botNumberJid.search("@"));

    bot.ev.on("groups.upsert", async (msg: GroupMetadata[]) => {
      // new group added
      try {
        console.log("[groups.upsert]");
        const from = msg[0].id;
        cache.del(`${from}:groupMetadata`);

        await bot.sendMessage(from, {
          text: `*─「 🔥 <{PVX}> BOT 🔥 」─* \n\nSEND ${prefix}help FOR BOT COMMANDS`,
        });
        await bot.sendMessage(myNumberWithJid, {
          text: `Bot is added to group.`,
        });
      } catch (err) {
        await LoggerBot(bot, "groups.upsert", err, msg);
      }
    });

    // TODO: CHECK PARTIAL
    bot.ev.on("groups.update", async (msg: Partial<GroupMetadata>[]) => {
      // subject change, etc
      try {
        console.log("[groups.update]");
        const from = msg[0].id;
        cache.del(`${from}:groupMetadata`);
      } catch (err) {
        await LoggerBot(bot, "groups.update", err, msg);
      }
    });

    interface GroupParticipantUpdate {
      id: string;
      participants: string[];
      action: ParticipantAction;
    }

    /* ------------------------ group-participants.update ----------------------- */
    bot.ev.on(
      "group-participants.update",
      async (msg: GroupParticipantUpdate) => {
        console.log("[group-participants.update]");
        try {
          const from = msg.id;
          const numJid = msg.participants[0];

          const numSplit = `${numJid.split("@s.whatsapp.net")[0]}`;
          if (numJid === botNumberJid && msg.action === "remove") {
            // bot is removed
            await bot.sendMessage(myNumberWithJid, {
              text: `Bot is removed from group.`,
            });
            return;
          }

          cache.del(`${from}:groupMetadata`);
          const groupMetadata = await bot.groupMetadata(from);
          const groupSubject = groupMetadata.subject;

          if (msg.action === "add") {
            await memberAddCheck(
              bot,
              from,
              numSplit,
              numJid,
              groupSubject,
              pvxgroups,
              myNumber
            );
            const text = `${groupSubject} [ADD] ${numSplit}`;
            await bot.sendMessage(myNumberWithJid, { text });
            console.log(text);
            stats.memberJoined += 1;
          } else if (msg.action === "remove") {
            const text = `${groupSubject} [REMOVE] ${numSplit}`;
            await bot.sendMessage(myNumberWithJid, { text });
            console.log(text);
            stats.memberLeft += 1;
          } else if (
            (msg.action === "promote" || msg.action === "demote") &&
            groupSubject.startsWith("<{PVX}>")
          ) {
            // promote, demote
            const getUsernamesRes = await getUsernames([numJid]);
            const username = getUsernamesRes.length
              ? getUsernamesRes[0].name
              : numSplit;
            const action =
              msg.action === "promote"
                ? "Promoted to Admin"
                : "Demoted to Member";
            const text = `*ADMIN CHANGE ALERT!!*\n\nUser: ${username}\nGroup: ${groupSubject}\nAction: ${action}`;
            await bot.sendMessage(pvxgroups.pvxadmin, { text });
            await bot.sendMessage(pvxgroups.pvxsubadmin, { text });
          }
        } catch (err) {
          await LoggerBot(bot, "group-participants.update", err, msg);
        }
      }
    );

    interface GroupMessageUpsert {
      messages: WAMessage[];
      type: MessageUpsertType;
    }
    bot.ev.on("messages.upsert", async (msgs: GroupMessageUpsert) => {
      // console.log("msgs: ", JSON.stringify(msgs, undefined, 2));
      // console.log(msgs.messages);
      try {
        // type: append (whatsapp web), notify (app)
        if (msgs.type === "append") return;

        // const msg: WAMessage = msgs.messages[0];
        msgs.messages.forEach(async (msg: WAMessage) => {
          // when demote, add, remove, etc happen then msg.message is not there
          if (!msg.message) return;

          // type to extract body text
          let type:
            | "textMessage"
            | "imageMessage"
            | "videoMessage"
            | "stickerMessage"
            | "documentMessage"
            | "extendedTextMessage"
            | "otherMessage";

          if (msg.message.conversation) {
            type = "textMessage";
          } else if (msg.message.imageMessage) {
            type = "imageMessage";
          } else if (msg.message.videoMessage) {
            type = "videoMessage";
          } else if (msg.message.stickerMessage) {
            type = "stickerMessage";
          } else if (msg.message.documentMessage) {
            type = "documentMessage";
          } else if (msg.message.extendedTextMessage) {
            type = "extendedTextMessage";
          } else type = "otherMessage";

          // ephemeralMessage are from disappearing chat
          // reactionMessage, audioMessage

          const acceptedType = [
            "textMessage",
            "imageMessage",
            "videoMessage",
            "stickerMessage",
            "documentMessage",
            "extendedTextMessage",
          ];
          if (!acceptedType.includes(type)) {
            return;
          }

          stats.totalMessages += 1;
          if (type === "extendedTextMessage") stats.textMessage += 1;
          else stats[type] += 1;

          // body will have the text message
          let body: string;
          if (msg.message.conversation) {
            body = msg.message.conversation;
          } else if (msg.message.reactionMessage?.text) {
            body = msg.message.reactionMessage.text;
          } else if (msg.message.imageMessage?.caption) {
            body = msg.message.imageMessage.caption;
          } else if (msg.message.videoMessage?.caption) {
            body = msg.message.videoMessage.caption;
          } else if (msg.message.documentMessage?.caption) {
            body = msg.message.documentMessage.caption;
          } else if (msg.message.extendedTextMessage?.text) {
            body = msg.message.extendedTextMessage.text;
          } else {
            body = "";
          }

          body = body.replace(/\n|\r/g, ""); // remove all \n and \r

          let isCmd = body.startsWith(prefix);

          const from = msg.key.remoteJid;
          if (!from) return;
          const isGroup = from.endsWith("@g.us");

          let groupMetadata: GroupMetadata | undefined;
          groupMetadata = cache.get(`${from}:groupMetadata`);

          if (isGroup && !groupMetadata) {
            console.log("FETCHING GROUP METADATA: ", from);

            groupMetadata = await bot.groupMetadata(from);
            // console.log(groupMetadata);
            cache.set(`${from}:groupMetadata`, groupMetadata, 60 * 60 * 24); // 24 hours
          }
          let sender = groupMetadata ? msg.key.participant : from;
          if (!sender) return;
          if (msg.key.fromMe) sender = botNumberJid;

          // remove : from number
          if (sender.includes(":")) {
            sender =
              sender.slice(0, sender.search(":")) +
              sender.slice(sender.search("@"));
          }
          const senderNumber = sender.split("@")[0];
          let senderName = msg.pushName;
          if (!senderName) senderName = "null";

          const groupName: string | undefined = groupMetadata?.subject;

          if (pvx) {
            // Count message
            if (
              groupName?.toUpperCase().includes("<{PVX}>") &&
              from !== pvxgroups.pvxstickeronly1 &&
              from !== pvxgroups.pvxstickeronly2 &&
              from !== pvxgroups.pvxdeals &&
              from !== pvxgroups.pvxtesting
            ) {
              if (from === pvxgroups.pvxsticker && msg.message.stickerMessage) {
                console.log(
                  "skipping count of sticker message in PVX sticker."
                );
                return;
              }
              const setCountMemberRes = await setCountMember(
                sender,
                from,
                senderName
              );
              await countRemainder(
                bot,
                setCountMemberRes,
                from,
                senderNumber,
                sender
              );
            }

            // count video
            if (from === pvxgroups.pvxmano && type === "videoMessage") {
              await setCountVideo(sender, from);
            }

            // Forward all stickers
            if (
              groupName?.toUpperCase().startsWith("<{PVX}>") &&
              msg.message.stickerMessage &&
              isStickerForward === "true" &&
              from !== pvxgroups.pvxstickeronly1 &&
              from !== pvxgroups.pvxstickeronly2 &&
              from !== pvxgroups.pvxmano
            ) {
              const forwardStickerRes = await forwardSticker(
                bot,
                msg.message.stickerMessage,
                pvxgroups.pvxstickeronly1,
                pvxgroups.pvxstickeronly2
              );
              if (forwardStickerRes) stats.stickerForwarded += 1;
              else stats.stickerNotForwarded += 1;
              return;
            }

            // auto sticker maker in pvx sticker group [empty caption], less than 2mb
            if (
              from === pvxgroups.pvxsticker &&
              body === "" &&
              (msg.message.imageMessage ||
                (msg.message.videoMessage?.fileLength &&
                  Number(msg.message.videoMessage.fileLength) <
                    2 * 1000 * 1000))
            ) {
              isCmd = true;
              body = "!s";
            }
          }

          if (!isCmd) {
            const messageLog = `[MESSAGE] ${
              body ? body.substr(0, 30) : type
            } [FROM] ${senderNumber} [IN] ${groupName || from}`;
            console.log(messageLog);
            return;
          }

          if (body[1] === " ") body = body[0] + body.slice(2); // remove space when space btw prefix and commandName like "! help"
          const args = body.slice(1).trim().split(/ +/);
          let command = args.shift()?.toLowerCase();
          if (!command) command = "";

          // Display every command info
          console.log(
            "[COMMAND]",
            command,
            "[FROM]",
            senderNumber,
            "[IN]",
            groupName || from
          );

          if (
            ["score", "scorecard", "scoreboard", "sc", "sb"].includes(command)
          ) {
            // for latest group desc
            groupMetadata = await bot.groupMetadata(from);
          }

          const groupDesc: string | undefined = groupMetadata?.desc?.toString();
          const groupMembers: GroupParticipant[] | undefined =
            groupMetadata?.participants;
          const groupAdmins: string[] | undefined =
            getGroupAdmins(groupMembers);
          const isBotGroupAdmins: boolean =
            groupAdmins?.includes(botNumberJid) || false;
          const isGroupAdmins: boolean = groupAdmins?.includes(sender) || false;

          // let groupData: GroupData | undefined = undefined;
          // if (groupMetadata) {
          //   groupData = getGroupData(groupMetadata, botNumberJid, sender);
          // }

          const reply = async (text: string | undefined): Promise<boolean> => {
            if (!text) return false;
            await bot.sendMessage(from, { text }, { quoted: msg });
            return true;
          };

          // CHECK IF COMMAND IF DISABLED FOR CURRENT GROUP OR NOT, not applicable for group admin
          let resDisabled: string[] | undefined = [];
          if (groupMetadata && !isGroupAdmins) {
            resDisabled = cache.get(`${from}:resDisabled`);
            if (!resDisabled) {
              const getDisableCommandRes = await getDisableCommand(from);
              resDisabled = getDisableCommandRes.length
                ? getDisableCommandRes[0].disabled
                : [];
              cache.set(`${from}:resDisabled`, resDisabled, 60 * 60);
            }
          }
          if (resDisabled && resDisabled.includes(command)) {
            await reply("❌ Command disabled for this group!");
            return;
          }
          if (command === "enable" || command === "disable") {
            cache.del(`${from}:resDisabled`);
          }

          // send every command info to my whatsapp, won't work when i send something for bot
          if (myNumber && myNumberWithJid !== sender) {
            stats.commandExecuted += 1;
            await bot.sendMessage(myNumberWithJid, {
              text: `${stats.commandExecuted}) [${prefix}${command}] [${groupName}]`,
            });
          }

          switch (command) {
            case "stats": {
              let statsMessage = "📛 PVX BOT STATS 📛\n";

              let key: keyof typeof stats;
              for (key in stats) {
                if (Object.prototype.hasOwnProperty.call(stats, key)) {
                  statsMessage += `\n${key}: ${stats[key]}`;
                }
              }

              await reply(statsMessage);
              return;
            }

            case "test":
              if (myNumberWithJid !== sender) {
                await reply(
                  `❌ Command only for owner for bot testing purpose!`
                );
                return;
              }

              if (args.length === 0) {
                await reply(`❌ empty query!`);
                return;
              }
              try {
                const resultTest = eval(args[0]);
                if (typeof resultTest === "object") {
                  await reply(JSON.stringify(resultTest));
                } else await reply(resultTest.toString());
              } catch (err) {
                await reply((err as Error).stack);
              }
              return;
          }

          const msgInfoObj: MsgInfoObj = {
            from,
            sender,
            senderName,
            groupName,
            groupDesc,
            groupMembers,
            groupAdmins,
            isBotGroupAdmins,
            isGroupAdmins,
            botNumberJid,
            command,
            args,
            reply,
            milestones,
            allCommandsName,
          };

          try {
            /* ----------------------------- public commands ---------------------------- */
            if (commandsPublic[command]) {
              await commandsPublic[command](bot, msg, msgInfoObj);
              return;
            }

            /* ------------------------- group members commands ------------------------- */
            if (commandsMembers[command]) {
              if (groupMetadata) {
                await commandsMembers[command](bot, msg, msgInfoObj);
                return;
              }
              await reply(
                "❌ Group command only!\n\nJoin group to use commands:\nhttps://chat.whatsapp.com/CZeWkEFdoF28bTJPAY63ux"
              );
              return;
            }

            /* -------------------------- group admins commands ------------------------- */
            if (commandsAdmins[command]) {
              if (!groupMetadata) {
                await reply(
                  "❌ Group command only!\n\nJoin group to use commands:\nhttps://chat.whatsapp.com/CZeWkEFdoF28bTJPAY63ux"
                );
                return;
              }

              if (isGroupAdmins) {
                await commandsAdmins[command](bot, msg, msgInfoObj);
                return;
              }
              await reply("❌ Admin command!");
              return;
            }

            /* ----------------------------- owner commands ----------------------------- */
            if (commandsOwners[command]) {
              if (myNumberWithJid === sender) {
                await commandsOwners[command](bot, msg, msgInfoObj);
                return;
              }
              await reply("❌ Owner command only!");
              return;
            }
          } catch (err) {
            await reply((err as Error).toString());
            await LoggerBot(bot, `COMMAND-ERROR in ${groupName}`, err, msg);
            return;
          }

          /* ----------------------------- unknown command ---------------------------- */
          let message = `Send ${prefix}help for <{PVX}> BOT commands list`;

          const matches = stringSimilarity.findBestMatch(
            command,
            allCommandsName
          );
          if (matches.bestMatch.rating > 0.5) {
            message = `Did you mean ${prefix}${matches.bestMatch.target}\n\n${message}`;
          }
          await reply(message);
          if (command) {
            await addUnknownCmd(command);
          }
        });
      } catch (err) {
        await LoggerBot(bot, "messages.upsert", err, msgs);
      }
    });

    bot.ev.on("connection.update", async (update) => {
      try {
        await LoggerTg(`connection.update: ${JSON.stringify(update)}`);
        const { connection, lastDisconnect } = update;
        if (connection === "open") {
          console.log("Connected");
          await bot.sendMessage(myNumberWithJid, {
            text: `[BOT STARTED] - ${startCount}`,
          });
          milestones = await addDefaultMilestones(bot, pvxgroups);

          // SET GROUP META DATA
          const chats = await bot.groupFetchAllParticipating();
          const groups = Object.values(chats)
            .filter((v) => v.id.endsWith("g.us"))
            .map((v) => ({
              subject: v.subject,
              desc: v.desc,
              id: v.id,
              participants: v.participants,
            }));

          groups.forEach((group) => {
            console.log("SET metadata for: ", group.subject);
            cache.set(`${group.id}:groupMetadata`, group, 60 * 60 * 24); // 24 hours
          });

          // bot.sendMessage(
          //   pvxcommunity,
          //   {
          //     text: `Yes`,
          //   },
          //   {
          //     quoted: {
          //       key: {
          //         remoteJid: pvxcommunity,
          //         fromMe: false,
          //         id: "710B5CF29EE7471fakeid",
          //         participant: "91967564hkjhk@s.whatsapp.net",
          //       },
          //       messageTimestamp: 1671784177,
          //       pushName: "xyz",
          //       message: { conversation: "text" },
          //     },
          //   }
          // );
        } else if (connection === "close") {
          console.log("connection update", update);

          // reconnect if not logged out
          if (!lastDisconnect) return;
          const shouldReconnect =
            (lastDisconnect.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut;
          if (shouldReconnect) {
            await LoggerBot(
              undefined,
              "CONNECTION-CLOSED",
              lastDisconnect.error,
              update
            );
            startCount += 1;

            console.log("[CONNECTION-CLOSED]: Restarting bot in 20 seconds!");
            setTimeout(async () => {
              await startBot();
            }, 1000 * 20);
          } else {
            await LoggerTg(
              `[CONNECTION-CLOSED]: You are logged out\nRestarting in 5 sec to scan new QR code!`
            );
            await dropAuth();
            try {
              fs.rmSync("./auth_info_multi", { recursive: true, force: true });
              console.log("Local auth_info_multi file deleted.");
              // fs.unlinkSync("./auth_info_multi.json");
            } catch (err) {
              console.log("Local auth_info_multi file already deleted.");
            }
            console.log(
              "[CONNECTION-CLOSED]: You are logged out\nRestarting in 5 sec to scan new QR code!"
            );
            setTimeout(async () => {
              await startBot();
            }, 1000 * 5);
          }
        }
      } catch (err) {
        await LoggerBot(undefined, "connection.update", err, update);
      }
    });

    // TODO: MAKE SEPERATE FILES for each event
    // listen for when the auth credentials is updated
    bot.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        await storeAuth(state);
      } catch (err) {
        await LoggerBot(bot, "creds.update", err, undefined);
      }
    });
    return bot;
  } catch (err) {
    await LoggerBot(undefined, "BOT-ERROR", err, "");
  }
  return false;
};

export default startBot;