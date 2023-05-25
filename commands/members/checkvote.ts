const { getVotingData } = require("../../db/VotingDB");

import { WAMessage } from "@adiwajshing/baileys";
import { MsgInfoObj } from "../../interface/msgInfoObj";
import { Bot } from "../../interface/Bot";

export const command = () => {
  let cmd = ["checkvote", "cv"];

  return { cmd, handler };
};

const handler = async (bot: Bot, msg: WAMessage, msgInfoObj: MsgInfoObj) => {
  let { prefix, reply, from } = msgInfoObj;
  let votingResult = await getVotingData(from);
  if (!votingResult.is_started) {
    await reply(
      `❌ Voting is not started here, Start by \n${prefix}startvote #title #name1 #name2 #name3`
    );
    return;
  }

  let resultVoteMsg = "";

  resultVoteMsg += `send "${prefix}vote number" to vote\n\n*🗣️ ${votingResult.title}*`;
  votingResult.choices.forEach((name: string, index: number) => {
    resultVoteMsg += `\n${index + 1} for [${name.trim()}]`;
  });
  resultVoteMsg += `\n\n*Voting Current Status:*`;

  let totalVoted = votingResult.voted_members.length;

  votingResult.choices.forEach((name: string, index: number) => {
    resultVoteMsg += `\n======= ${(
      (votingResult.count[index] / totalVoted) *
      100
    ).toFixed()}% =======\n📛 *[${name.trim()}] : ${
      votingResult.count[index]
    }*\n`;

    //add voted members username
    votingResult.members_voted_for[index].forEach((mem: any) => {
      resultVoteMsg += `_${mem},_ `;
    });
  });
  await reply(resultVoteMsg);
};