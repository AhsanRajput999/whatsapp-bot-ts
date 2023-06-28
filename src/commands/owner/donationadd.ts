import { WAMessage } from "@adiwajshing/baileys";
import { MsgInfoObj } from "../../interface/msgInfoObj";
import { Bot } from "../../interface/Bot";
import { addDonation } from "../../db/donationDB";
import { prefix } from "../../constants/constants";

const handler = async (bot: Bot, msg: WAMessage, msgInfoObj: MsgInfoObj) => {
  const { reply, args } = msgInfoObj;
  const body = msg.message?.conversation;
  if (!body) {
    await reply(`❌ Body is empty!`);
    return;
  }

  if (args.length === 0) {
    await reply(`❌ Error! Add by ${prefix}adddonation #name #number #amount`);
    return;
  }

  // let donaList = body.trim().replace(/ +/, ",").split(",")[1].split("#");
  const donaList = body.trim().split("#");
  // [!adddonation, name, number, amount] = 4
  if (donaList.length !== 4) {
    await reply(`❌ Error! Add by ${prefix}adddonation #name #number #amount`);
    return;
  }
  const name = donaList[1].trim().toLowerCase();
  const number = Number(donaList[2].trim());
  const amount = Number(donaList[3].trim());

  console.log(`name: ${name}, number: ${number}, amount: ${amount}`);

  if (name && number && amount) {
    const addDonationRes = await addDonation(name, number, amount);
    if (addDonationRes) await reply("✔️ Added!");
    else await reply(`❌ There is some problem!`);
  } else {
    await reply(`❌ Error! Add by ${prefix}adddonation #name #number #amount`);
  }
};

const donationadd = () => {
  const cmd = ["donationadd", "da"];

  return { cmd, handler };
};

export default donationadd;