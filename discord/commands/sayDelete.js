import { ApplicationCommandType, ContextMenuCommandBuilder, InteractionContextType, PermissionFlagsBits } from "discord.js";
import { confirmDelete } from "./say.js";

// Message menu (right-click a message > Apps). Same default permission as /say.
export const data = new ContextMenuCommandBuilder()
    .setName("Botの発言を削除")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild);

export const execute = (interaction) => confirmDelete(interaction);
