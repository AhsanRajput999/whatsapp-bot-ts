const { getCountTop } = require("../../db/countMemberDB");
import { WAMessage } from "@adiwajshing/baileys";
import { MsgInfoObj } from "../../interface/msgInfoObj";
import { Bot } from "../../interface/Bot";

export const command = () => {
  let cmd = ["pvxtm", "pvxmt"];

  return { cmd, handler };
};

const handler = async (bot: Bot, msg: WAMessage, msgInfoObj: MsgInfoObj) => {
  let { groupName, reply, groupMembers } = msgInfoObj;
  if (!groupMembers) return;

  const more = String.fromCharCode(8206);
  const readMore = more.repeat(4001);
  const groupMembersId = groupMembers.map((member) => member.id);

  let resultCountGroupTop = await getCountTop(10000);

  let countGroupMsgTop = `*${groupName}*\n_MEMBERS RANK_${readMore}\n`;

  resultCountGroupTop.forEach((member: any, index: number) => {
    if (groupMembersId.includes(member.memberjid))
      countGroupMsgTop += `\n${index + 1}) ${member.name} - ${member.count}`;
  });

  reply(countGroupMsgTop);
};