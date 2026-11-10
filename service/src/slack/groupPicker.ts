import type { GroupId, GroupRef } from "../groups/groups.ts";
import { plainText, shortened } from "./blocks.ts";

const optionsPerList = 100;
const optionTextLimit = 75;

export function groupSelectOf(actionId: string, groups: GroupRef[], picked: GroupId) {
  const options = groupOptionsOf(groups);
  const initial = options.find(({ value }) => value === picked);
  return { type: "static_select", action_id: actionId, placeholder: plainText("Pick a group"), ...optionListsOf(options), ...(initial !== undefined && { initial_option: initial }) };
}

export function groupOptionsOf(groups: GroupRef[]) {
  return groups.map(({ group, name }) => ({ text: plainText(shortened(name, optionTextLimit)), value: group }));
}

export function optionListsOf<Option>(options: Option[], listed = "Groups") {
  if (options.length <= optionsPerList) return { options };
  const lists = Array.from({ length: Math.ceil(options.length / optionsPerList) }, (_, index) => options.slice(index * optionsPerList, (index + 1) * optionsPerList));
  return { option_groups: lists.map((list, index) => ({ label: plainText(`${listed} ${index * optionsPerList + 1}–${index * optionsPerList + list.length}`), options: list })) };
}
