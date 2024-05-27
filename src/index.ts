import { Context, Schema, h  } from 'koishi'

export const name = 'waifu-diffusion-tagger'

export interface Tags {
  threshold: number
  useMCutThreshold: boolean
}

export const GeneralTags: Schema<Tags> = Schema.object({
  threshold: Schema.number()
    .min(0)
    .max(1)
    .step(0.01)
    .default(0.35)
    .description("通用标签阈值"),
  useMCutThreshold: Schema.boolean()
    .default(false)
    .description("使用MCut阈值")
})


export const CharacterTags: Schema<Tags> = Schema.object({
  threshold: Schema.number()
    .min(0)
    .max(1)
    .step(0.01)
    .default(0.85)
    .description("角色标签阈值"),
  useMCutThreshold: Schema.boolean()
    .default(false)
    .description("使用MCut阈值")
})

export interface Config {
  model:"SmilingWolf/wd-swinv2-tagger-v3" | 
        "SmilingWolf/wd-convnext-tagger-v3" |
        "SmilingWolf/wd-vit-tagger-v3" | 
        "SmilingWolf/wd-v1-4-moat-tagger-v2" | 
        "SmilingWolf/wd-v1-4-swinv2-tagger-v2" | 
        "SmilingWolf/wd-v1-4-convnext-tagger-v2" | 
        "SmilingWolf/wd-v1-4-convnextv2-tagger-v2" | 
        "SmilingWolf/wd-v1-4-vit-tagger-v2"
  generalTags: Tags
  characterTags: Tags
}

export const Config: Schema<Config> = Schema.object({
  model: Schema
    .union([
      "SmilingWolf/wd-swinv2-tagger-v3", 
      "SmilingWolf/wd-convnext-tagger-v3", 
      "SmilingWolf/wd-vit-tagger-v3", 
      "SmilingWolf/wd-v1-4-moat-tagger-v2",  
      "SmilingWolf/wd-v1-4-swinv2-tagger-v2",  
      "SmilingWolf/wd-v1-4-convnext-tagger-v2",  
      "SmilingWolf/wd-v1-4-convnextv2-tagger-v2",  
      "SmilingWolf/wd-v1-4-vit-tagger-v2"
    ])
    .default("SmilingWolf/wd-swinv2-tagger-v3")
    .role("")
    .description("选择模型"),
  generalTags: GeneralTags,
  characterTags: CharacterTags
  
})

export function apply(ctx: Context, config: Config) {
  ctx.command("tagger [img:image]", "图片反推AI生成标签")
    .action(async ({session}, img) => {
      let url: string
      if (img) {
        url = img.url
      } else {
        let element = session.quote?.elements
        if (!element) {
          await session.send("请在30秒内发送一张图片")
          const msg = await session.prompt(30000)
          if (msg !== undefined) {
            element = h.parse(msg)
          } else {
            return '超时'
          }
        }
  
        const image = h.select(element, 'img')
        if (image.length === 0) return '这看上去不是图片'

        url = image[0].attrs.src
      }

      await session.send("正在识别，请稍等...")

      let uploadFormData = new FormData()
      uploadFormData.append('files', await ctx.http.get(url, {responseType: 'blob'}))
      const hash = Date.now()

      const path = (await ctx.http.post(`https://smilingwolf-wd-tagger.hf.space/upload?upload_id=${hash}`, uploadFormData))[0]

      let body = {
        "data": [
          {
            "path": path,
            "size": null,
            "mime_type": "",
          },
          config.model,
          config.generalTags.threshold,
          config.generalTags.useMCutThreshold,
          config.characterTags.threshold,
          config.characterTags.useMCutThreshold,
        ],
        "event_data": null,
        "fn_index": 2,
        "trigger_id": 18,
        "session_hash": String(hash),
      }

      await ctx.http.post("https://smilingwolf-wd-tagger.hf.space/queue/join", body)

      const res = await ctx.http.get(`https://smilingwolf-wd-tagger.hf.space/queue/data?session_hash=${hash}`)
      let data = JSON.parse(res.split("\n")[4].slice(5, res.split("\n")[4].length)).output.data
      
      let result =  `标签：\n${data[0]}\n\n角色：${data[2].label}`
      for (let character of data[2].confidences) {
        result += `\n${character.label} (${Math.trunc(character.confidence * 100)}%)`
      }
      

      result += `\n\n安全程度：${data[1].label}`
      for (let rating of data[1].confidences) {
        result += `\n${rating.label} (${Math.trunc(rating.confidence * 100)}%)`
      }

      return result
    })

}
