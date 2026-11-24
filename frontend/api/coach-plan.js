import { validateCoachRequest } from '../../services/coach-http.mjs'
import coach from '../../services/coach/index.js'

// The standalone frontend project uses the same Coach with its original public ingress policy.
export default {
  fetch(request) {
    return validateCoachRequest(request, { checkOrigin: true }).rejection ?? coach.fetch(request)
  },
}
