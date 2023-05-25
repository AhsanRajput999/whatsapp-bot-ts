import { WAMessage } from "@adiwajshing/baileys";
import { MsgInfoObj } from "../../interface/msgInfoObj";
import { Bot } from "../../interface/Bot";

const { getVotingData, stopVotingData } = require("../../db/VotingDB");

export const command = () => {
  let cmd = ["stopvote"];

  return { cmd, handler };
};

const handler = async (bot: Bot, msg: WAMessage, msgInfoObj: MsgInfoObj) => {
  let { prefix, reply, isGroupAdmins, sender, from } = msgInfoObj;
  let votingResult = await getVotingData(from);
  if (!votingResult.is_started) {
    await reply(
      `❌ Voting is not started here, Start by \n${prefix}startvote #title #name1 #name2 #name3`
    );
    return;
  }

  let resultVoteMsg = "";
  if (votingResult.started_by === sender || isGroupAdmins) {
    await stopVotingData(from);
    resultVoteMsg += `*Voting Result:*\n🗣️ ${votingResult.title}`;
  } else {
    await reply(
      "❌ Only admin or that member who started the voting, can stop current voting!"
    );
    return;
  }

  let totalVoted = votingResult.voted_members.length;

  votingResult.choices.forEach((name: string, index: number) => {
    resultVoteMsg += `\n======= ${(
      (votingResult.count[index] / totalVoted) *
      100
    ).toFixed()}% =======\n📛 *[${name.trim()}] : ${
      votingResult.count[index]
    }*\n`;

    //add voted members username
    votingResult.members_voted_for[index].forEach((mem: string) => {
      resultVoteMsg += `_${mem},_ `;
    });
  });
  await reply(resultVoteMsg);
};