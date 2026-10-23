import { Suspense } from "react"
import TransContent from "./TransContent"

const Page = () => {
  return (
    <Suspense fallback={<div>Loading provider selection...</div>}>
        <TransContent />
    </Suspense>
  )
}
export default Page