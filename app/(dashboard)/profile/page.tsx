import { Suspense } from "react"
import ProfileContent from "./ProfileContent"

const Page = () => {
  return (
    <Suspense fallback={<div>Loading profile...</div>}>
      <ProfileContent />
    </Suspense>
  )
}
export default Page