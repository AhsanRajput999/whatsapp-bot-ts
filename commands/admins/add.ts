import { WAMessage } from "@adiwajshing/baileys";
import { MsgInfoObj } from "../../interface/msgInfoObj";
import { Bot } from "../../interface/Bot";

export const command = () => {
  let cmd = ["add"];

  return { cmd, handler };
};

const handler = async (bot: Bot, msg: WAMessage, msgInfoObj: MsgInfoObj) => {
  let { isBotGroupAdmins, reply, args, from } = msgInfoObj;

  if (!isBotGroupAdmins) {
    await reply("❌ I'm not Admin here!");
    return;
  }

  let num: string;
  if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
    //member's message is tagged to add
    num = msg.message.extendedTextMessage.contextInfo.participant;
  } else {
    //number is given like !add 919557---82
    if (args.length === 0) {
      await reply("❌ Give number to add!");
      return;
    }
    num = `${args.join("").replace(/ |-|\(|\)/g, "")}@s.whatsapp.net`; //remove spaces , ( , ) and -
    if (num.startsWith("+")) {
      //remove + sign from starting if given
      num = num.slice(1);
    }
  }

  let response:
    | {
        status: string;
        jid: string;
      }[]
    | undefined = undefined;

  try {
    response = await bot.groupParticipantsUpdate(from, [num], "add");
  } catch (err) {
    console.log(err);
    reply(
      `_❌ Check the number, include country code also!_\nError: ${(
        err as Error
      ).toString()}`
    );
    return;
  }

  if (response == undefined) {
    reply(`_❌ There is some problem`);
    return;
  }

  let status = Number(response[0].status);
  if (status == 400) {
    await reply("_❌ Invalid number, include country code also!_");
  } else if (status == 403) {
    await reply("_❌ Number has privacy on adding group!_");
  } else if (status == 408) {
    await reply("_❌ Number has left the group recently!_");
  } else if (status == 409) {
    await reply("_❌ Number is already in group!_");
  } else if (status == 500) {
    await reply("_❌ Group is currently full!_");
  } else if (status == 200) {
    await reply("_✔ Number added to group!_");
  }
};
