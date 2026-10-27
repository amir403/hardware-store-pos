import { prisma } from "@/app/lib/prisma";

/** Serves a product photo. URLs carry a version, so they can be cached forever. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const image = await prisma.productImage.findUnique({
    where: { productId: id },
    select: { data: true, contentType: true },
  });
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
