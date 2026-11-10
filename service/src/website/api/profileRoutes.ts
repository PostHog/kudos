// The website API's routes for the profile, the player card, links and previews, settings, onboarding, the emoji
// wizard, buying, quests, seen and last visit, and browser analytics. Stack S17 fills this list; the route table
// (table.ts) takes it as it is.
import { getBrowserAnalytics, getBrowserAnalyticsArgs } from "../browserAnalytics.ts";
import { findSlackEmojis, findSlackEmojisArgs, getAppEmojis, getAppEmojisArgs, mapMyEmoji, mapMyEmojiArgs } from "../emojiWizard.ts";
import { arrive, arriveArgs } from "../lastVisit.ts";
import { closeHowItWorks, closeHowItWorksArgs } from "../onboarding.ts";
import { getPlayerCard, getPlayerCardArgs, getPlayerCardEmojis, getPlayerCardEmojisArgs } from "../playerCard.ts";
import { getMyProfile } from "../profile.ts";
import { getProfileCard } from "../profileCard.ts";
import { getQuests, getQuestsArgs, viewQuests, viewQuestsArgs } from "../quests.ts";
import { getSettings, getSettingsArgs } from "../settings.ts";
import {
  pickPrimaryGroup,
  pickPrimaryGroupArgs,
  pickWeeklyPostChannel,
  pickWeeklyPostChannelArgs,
  setAvatar,
  setAvatarArgs,
  setBoardVisibility,
  setBoardVisibilityArgs,
  setMessageSetting,
  setMessageSettingArgs,
  setPublicCelebrations,
  setPublicCelebrationsArgs,
  setWeeklyPost,
  setWeeklyPostArgs,
} from "../settingsCommands.ts";
import { getSkillTree, getSkillTreeArgs } from "../skillTree.ts";
import { buyCrate, buyCrateArgs, buyItem, buyItemArgs, buyPerk, buyPerkArgs } from "../storeCommands.ts";
import { endXpMoment, endXpMomentArgs, getXpMoment, getXpMomentArgs } from "../xpMoment.ts";
import { memberCommand, memberRead, type Route } from "./route.ts";

// `as const satisfies` keeps each route's name and result type, which the return-type check reads.
export const profileRoutes = [
  memberRead("website.profile.getMyProfile", {}, getMyProfile),
  memberRead("website.profileCard.getProfileCard", {}, getProfileCard),
  memberRead("website.playerCard.getPlayerCard", getPlayerCardArgs.shape, getPlayerCard),
  memberRead("website.playerCard.getPlayerCardEmojis", getPlayerCardEmojisArgs.shape, getPlayerCardEmojis),
  memberRead("website.settings.getSettings", getSettingsArgs, getSettings),
  memberRead("website.skillTree.getSkillTree", getSkillTreeArgs, getSkillTree),
  memberRead("website.emojiWizard.findSlackEmojis", findSlackEmojisArgs, findSlackEmojis),
  memberRead("website.emojiWizard.getAppEmojis", getAppEmojisArgs, getAppEmojis),
  memberCommand("website.emojiWizard.mapMyEmoji", mapMyEmojiArgs, mapMyEmoji),
  memberCommand("website.onboarding.closeHowItWorks", closeHowItWorksArgs, closeHowItWorks),
  memberRead("website.quests.getQuests", getQuestsArgs, getQuests),
  memberCommand("website.quests.viewQuests", viewQuestsArgs, viewQuests),
  memberCommand("website.lastVisit.arrive", arriveArgs, arrive),
  memberRead("website.xpMoment.getXpMoment", getXpMomentArgs, getXpMoment),
  memberCommand("website.xpMoment.endXpMoment", endXpMomentArgs, endXpMoment),
  memberRead("website.browserAnalytics.getBrowserAnalytics", getBrowserAnalyticsArgs, getBrowserAnalytics),
  memberCommand("website.commands.buyPerk", buyPerkArgs, buyPerk),
  memberCommand("website.commands.buyItem", buyItemArgs, buyItem),
  memberCommand("website.commands.buyCrate", buyCrateArgs, buyCrate),
  memberCommand("website.commands.setBoardVisibility", setBoardVisibilityArgs, setBoardVisibility),
  memberCommand("website.commands.setAvatar", setAvatarArgs, setAvatar),
  memberCommand("website.commands.setMessageSetting", setMessageSettingArgs, setMessageSetting),
  memberCommand("website.commands.setWeeklyPost", setWeeklyPostArgs, setWeeklyPost),
  memberCommand("website.commands.setPublicCelebrations", setPublicCelebrationsArgs, setPublicCelebrations),
  memberCommand("website.commands.pickWeeklyPostChannel", pickWeeklyPostChannelArgs, pickWeeklyPostChannel),
  memberCommand("website.commands.pickPrimaryGroup", pickPrimaryGroupArgs, pickPrimaryGroup),
] as const satisfies readonly Route[];
