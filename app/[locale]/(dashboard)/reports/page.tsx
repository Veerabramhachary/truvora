import { Suspense } from "react"
import ReportContent from "./ReportContent"

const Page = () => {
  return (
    <Suspense>
      <ReportContent />
    </Suspense>
  )
}
export default Page