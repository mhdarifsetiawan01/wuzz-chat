import { redirect } from 'next/navigation'

// Link universal grup (https://chat.wuzzhub.id/g/grp_xxx) -> buka di web chat
export default async function GroupLinkPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  redirect(`/chat?room=${encodeURIComponent(decodeURIComponent(roomId))}`)
}
