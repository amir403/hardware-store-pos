import sharp from "sharp";
import { prisma } from "@/app/lib/prisma";

const MAX_BYTES = 8 * 1024 * 1024;
const SIZE_PX = 512;

export type ImageChange =
  | { kind: "keep" }
  | { kind: "remove" }
  | { kind: "set"; data: Uint8Array<ArrayBuffer> }
  | { kind: "error"; message: string };

/**
 * Read the product form's `image` file and `removeImage` box. A new photo is
 * decoded and re-encoded as a small square-fitted WebP here, so whatever the
 * phone sent (HEIC aside), only a clean ~50 KB image is ever stored.
 */
export async function readImageChange(formData: FormData): Promise<ImageChange> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      return { kind: "error", message: "Choose a photo (JPG, PNG or WebP)." };
    }
    if (file.size > MAX_BYTES) {
      return { kind: "error", message: "That photo is over 8 MB. Choose a smaller one." };
    }
    try {
      const data = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate() // honour the phone's orientation flag
        .resize(SIZE_PX, SIZE_PX, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      return { kind: "set", data: new Uint8Array(data) };
    } catch {
      return { kind: "error", message: "That file could not be read as a photo." };
    }
  }
  return formData.get("removeImage") === "on" ? { kind: "remove" } : { kind: "keep" };
}

/** Store or delete the photo and point the product's imageUrl at it. */
export async function applyImageChange(productId: string, change: ImageChange): Promise<void> {
  if (change.kind === "set") {
    await prisma.productImage.upsert({
      where: { productId },
      create: { productId, data: change.data, contentType: "image/webp" },
      update: { data: change.data, contentType: "image/webp" },
    });
    // The version query busts browser caches when the photo is replaced.
    await prisma.product.update({
      where: { id: productId },
      data: { imageUrl: `/api/products/${productId}/image?v=${Date.now()}` },
    });
  } else if (change.kind === "remove") {
    await prisma.productImage.deleteMany({ where: { productId } });
    await prisma.product.update({ where: { id: productId }, data: { imageUrl: null } });
  }
}
