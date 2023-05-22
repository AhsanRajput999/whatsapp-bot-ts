import { WAMessage } from "@adiwajshing/baileys";
import { MsgInfoObj } from "../../interface/msgInfoObj";

const { setGroupLink, setGroupLinkEnabled } = require("../../db/grouplinksDB");

export const command = () => {
  let cmd = ["setlink", "sl"];

  return { cmd, handler };
};

const handler = async (bot: any, msg: WAMessage, msgInfoObj: MsgInfoObj) => {
  let { prefix, reply, args, from } = msgInfoObj;

  if (args[0]) {
    const enabled = Number(args[0]);

    const res = await setGroupLinkEnabled(enabled);

    if (res) await reply(`✔ Group link enabled updated with value: ${enabled}`);
    else
      await reply(
        `❌ There is some problem!\nGive only integer value with ${prefix}setlink #0`
      );
    return;
  }

  let link = "https://chat.whatsapp.com/" + (await bot.groupInviteCode(from));
  console.log(from, link);

  if (!from.endsWith("@g.us")) {
    await reply(`❌ Wrong groupjid!`);
    return;
  }

  if (!link.startsWith("https://chat.whatsapp.com/")) {
    await reply(`❌ Wrong grouplink!`);
    return;
  }

  const res = await setGroupLink(from, link);
  if (res) await reply(`✔ Group link updated in DB!`);
  else await reply(`❌ There is some problem!`);
};