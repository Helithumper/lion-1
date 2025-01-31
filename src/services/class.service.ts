import {
  Guild,
  GuildChannel,
  Permissions,
  CategoryChannel,
  TextChannel,
  VoiceChannel,
} from 'discord.js';
import { ClassVoiceChan } from '../app/plugins/createclassvoice.plugin';
import { ClassType, IUser, IClassRequest, RequestType, Maybe } from '../common/types';
import { GuildService } from './guild.service';

export class ClassService {
  private _guild: Guild;
  private _channels = new Map<ClassType, Map<string, GuildChannel>>();

  //When someone is allowed in a channel the bitfield value is the sum of their permissionOverwrites
  private _ALLOW_BITFIELD = Permissions.FLAGS.VIEW_CHANNEL + Permissions.FLAGS.SEND_MESSAGES;
  private _DENY_BITFIELD = 0;
  private _MAX_CLASS_LIST_LEN = 1600;

  private _classVoiceChans: Map<string, ClassVoiceChan> = new Map();
  private _AUDIO_CAT: Maybe<CategoryChannel> = null;

  constructor(private _guildService: GuildService) {
    this._guild = this._guildService.get();
    this._addClasses();
  }

  public getClasses(classType: ClassType): Map<string, GuildChannel> {
    if (classType === ClassType.ALL) {
      const ret = new Map<string, GuildChannel>();
      for (const classType of Object.keys(ClassType).filter((k) => k !== ClassType.ALL)) {
        for (const [key, value] of this.getClasses(this.resolveClassType(classType)).entries()) {
          ret.set(key, value);
        }
      }
      return ret;
    }
    return this._channels.get(classType) || new Map<string, GuildChannel>();
  }

  async register(request: IClassRequest): Promise<string> {
    const { author, categoryType, className } = request;
    try {
      if (!categoryType) {
        // Since category types are only dealt with registration of categories,
        // we are handling an individual class registration.
        if (!className) {
          throw new Error('No class name detected');
        }
        const classObj = this._findClassByName(className);
        if (!classObj) {
          throw new Error('Unable to locate this class');
        }
        await classObj.createOverwrite(author.id, {
          VIEW_CHANNEL: true,
          SEND_MESSAGES: true,
        });
        return `You have successfully been added to ${className}`;
      } else {
        // The user has requested to registered for all classes.
        return await this._registerAll(author, categoryType);
      }
    } catch (e) {
      return `${e}`;
    }
  }

  async unregister(request: IClassRequest): Promise<string> {
    const { author, categoryType, className } = request;
    try {
      if (!categoryType) {
        // Since category types are only dealt with registration of categories,
        // we are handling an individual class registration.
        if (!className) {
          throw new Error('No class name detected');
        }
        const classObj = this._findClassByName(className);
        if (!classObj) {
          throw new Error('Unable to locate this class');
        }
        await classObj.createOverwrite(author.id, {
          VIEW_CHANNEL: false,
          SEND_MESSAGES: false,
        });
        return `You have successfully been removed from ${className}`;
      } else {
        // The user has requested to unregister from all classes.
        return await this._unregisterAll(author, categoryType);
      }
    } catch (e) {
      return `${e}`;
    }
  }

  public buildRequest(author: IUser, args: string[] | undefined): IClassRequest | undefined {
    if (!args) {
      return undefined;
    }
    args = args.map((arg) => arg.toUpperCase());
    let categoryType: ClassType | undefined = undefined;
    let requestType: RequestType;
    let className: string = '';

    if (args.length === 2) {
      const category = args[1];
      categoryType = this.resolveClassType(category);
    }

    if (!categoryType) {
      requestType = RequestType.Channel;
      className = args[0];
    } else {
      requestType = RequestType.Category;
    }

    // In the case of a user inputting `!register all`, we will need to take care of this corner case.
    if (args.length === 1 && args[0] === ClassType.ALL) {
      requestType = RequestType.Category;
      categoryType = ClassType.ALL;
      args[0] = '';
    }

    return {
      author,
      categoryType,
      requestType,
      className,
    };
  }

  public updateClasses(): void {
    this._channels.clear();
    this._addClasses();
  }

  private _addClasses(): void {
    this._guild.channels.cache.forEach((channel) => {
      if (!channel.parentID) {
        return;
      }

      const category = this._guild.channels.cache.get(channel.parentID);

      if (category?.name.toLowerCase().includes('classes')) {
        for (const classType of Object.keys(ClassType).filter((k) => k !== ClassType.ALL)) {
          if (category.name.toUpperCase().startsWith(classType)) {
            const classes = this.getClasses(this.resolveClassType(classType));
            classes.set(channel.name, channel);
            this._channels.set(this.resolveClassType(classType), classes);
          }
        }
      }
    });
  }

  public resolveClassType(classType: string): ClassType {
    return ClassType[classType as keyof typeof ClassType];
  }

  public buildClassListText(classType: string): string[] {
    const classGroupsToList =
      classType === ClassType.ALL
        ? Object.keys(ClassType).filter((k) => k !== ClassType.ALL)
        : [classType];

    const responses = [];
    for (const classType of classGroupsToList) {
      const classNames = Array.from(
        this.getClasses(this.resolveClassType(classType)),
        ([k, v]) => v.name
      ).sort();

      const startOfResponse = `\`\`\`\n${classType} Classes:`;
      let currentResponse = startOfResponse;
      for (const className of classNames) {
        if (currentResponse.length + className.length + 4 >= this._MAX_CLASS_LIST_LEN) {
          currentResponse += '\n```';
          responses.push(currentResponse);
          currentResponse = startOfResponse;
          console.log(currentResponse);
        }
        currentResponse += `\n${className}`;
      }

      if (currentResponse.length) {
        currentResponse += `\n\`\`\``;
        responses.push(currentResponse);
      }
    }

    return responses;
  }

  public isClassChannel(className: string): boolean {
    return Boolean(this._findClassByName(className));
  }

  private async _registerAll(author: IUser, categoryType: ClassType): Promise<string> {
    if (!categoryType) {
      categoryType = ClassType.ALL;
    }

    const classes = this.getClasses(categoryType);
    for (const classObj of classes) {
      const [, channel] = classObj;

      const currentPerms = channel.permissionOverwrites.get(author.id);
      if (currentPerms) {
        if (currentPerms.allow.bitfield === this._ALLOW_BITFIELD) {
          continue;
        }
      }
      await channel.createOverwrite(author.id, { VIEW_CHANNEL: true, SEND_MESSAGES: true });
    }
    return `You have successfully been added to the ${categoryType} category.`;
  }

  private async _unregisterAll(
    author: IUser,
    categoryType: ClassType | undefined
  ): Promise<string> {
    if (!categoryType) {
      categoryType = ClassType.ALL;
    }

    const classes = this.getClasses(categoryType);
    for (const classObj of classes) {
      const [, channel] = classObj;

      const currentPerms = channel.permissionOverwrites.get(author.id);
      if (currentPerms) {
        //Bitfield is 0 for deny, 1 for allow
        if (currentPerms.allow.bitfield === this._DENY_BITFIELD) {
          continue;
        }
      }
      await channel.createOverwrite(author.id, {
        VIEW_CHANNEL: false,
        SEND_MESSAGES: false,
      });
    }
    return `You have successfully been removed from the ${categoryType} category.`;
  }

  private _findClassByName(className: string) {
    className = className.toLowerCase();
    const classes = this.getClasses(ClassType.ALL);
    for (const classObj of classes) {
      const [classChanName, classChanObj] = classObj;
      if (classChanName === className) {
        return classChanObj;
      }
    }
    return undefined;
  }

  public getVoiceChannels() {
    return this._classVoiceChans;
  }

  public async createVoiceChan(classChan: TextChannel): Promise<Maybe<VoiceChannel>> {
    if (this._classVoiceChans.get(classChan.name)) {
      return null;
    }

    if (!this._AUDIO_CAT) {
      this._AUDIO_CAT = this._guild.channels.cache
        .filter((c) => c.name === 'Audio Channels')
        .first() as CategoryChannel;
    }

    const voiceChan = await this._guild.channels.create(classChan.name, {
      type: 'voice',
      parent: this._AUDIO_CAT,
      permissionOverwrites: classChan.permissionOverwrites,
    });

    this._classVoiceChans.set(
      classChan.name,
      new ClassVoiceChan(voiceChan, classChan, voiceChan.members.size)
    );
    return voiceChan;
  }

  public async deleteVoiceChan(name: string) {
    const vc = this._classVoiceChans.get(name);
    if (!vc) {
      return;
    }

    await vc.voiceChan.delete('Inactive').then(() => this._classVoiceChans.delete(name));
  }

  public udpateClassVoice(name: string, vcObj: ClassVoiceChan) {
    this._classVoiceChans.set(name, vcObj);
  }
}
