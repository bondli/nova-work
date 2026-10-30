/** 图片地址处理：把淘宝/天猫（alicdn）缩略图还原为原图 */

/**
 * alicdn 缩略图形如 `xxx.jpg_60x60q90.jpg`、`xxx.jpg_.webp`、`xxx.jpg_summ.jpg`，
 * 去掉尺寸后缀即可拿到原图地址。
 */
export function upgradeImageUrl(raw: string): string {
  if (!raw || !raw.includes("alicdn.com")) return raw
  return raw
    .replace(/(_\d{2,4}x\d{2,4}(?:q\d+)?)\.(?:jpg|jpeg|png|webp)(?=$|\?)/i, "")
    .replace(/_\.webp(?=$|\?)/i, "")
    .replace(/_summ\.jpg(?=$|\?)/i, "")
}
