import { Suspense } from "react"
import SubscContent from "./SubcContent"

const Page = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
        <SubscContent />
    </Suspense>
  )
}
export default Page