import { h, FunctionComponent, Fragment } from 'preact'
import {
  useEffect,
  useState,
  useContext,
  unmountComponentAtNode,
} from 'preact/compat'
import classNames from 'classnames'
import { sanitize } from 'dompurify'
import { Button } from '@onfido/castor-react'

import { LocaleContext } from '~locales'
import { trackComponent } from '../../Tracker'
import ScreenLayout from '../Theme/ScreenLayout'
import { isButtonGroupStacked } from '../Theme/utils'
import theme from '../Theme/style.scss'

import DeclineModal from './DeclineModal'
import style from './style.scss'

import type { StepComponentUserConsentProps } from '~types/routers'
import { ApiRawError, SuccessCallback } from '~types/api'

type UserConsentProps = StepComponentUserConsentProps

type ActionsProps = {
  onAccept(): void
  onDecline(): void
}

const Actions: FunctionComponent<ActionsProps> = ({ onAccept, onDecline }) => {
  const { translate } = useContext(LocaleContext)
  const primaryBtnCopy = translate('user_consent.button_primary')
  const secondaryBtnCopy = translate('user_consent.button_secondary')
  return (
    <div
      className={classNames(style.actions, {
        [style.vertical]: isButtonGroupStacked(),
      })}
    >
      <Button
        variant="secondary"
        className={classNames(
          theme['button-sm'],
          style.action,
          style.secondary,
          {
            [style.vertical]: isButtonGroupStacked(),
          }
        )}
        data-onfido-qa="userConsentBtnSecondary"
        onClick={onDecline}
      >
        {secondaryBtnCopy}
      </Button>
      <Button
        variant="primary"
        className={classNames(theme['button-sm'], style.action, {
          [style.vertical]: isButtonGroupStacked(),
        })}
        data-onfido-qa="userConsentBtnPrimary"
        onClick={onAccept}
      >
        {primaryBtnCopy}
      </Button>
    </div>
  )
}

const getConsentFile = (
  onSuccess: SuccessCallback<string>,
  onError: (error: ApiRawError) => void
): void => {
  const request = new XMLHttpRequest()
  request.open('GET', process.env.USER_CONSENT_URL)

  request.onload = () => {
    if (request.status === 200 || request.status === 201) {
      onSuccess(request.responseText)
    } else {
      // TODO in CX-6197: if there is an error, we will display a reload screen
      onError(request)
    }
  }
  request.onerror = () => onError(request)

  request.send()
}

const UserConsent: FunctionComponent<UserConsentProps> = ({
  nextStep,
  containerEl,
  containerId,
  events,
}) => {
  const [consentHtml, setConsentHtml] = useState('')
  const [isModalOpen, setModalToOpen] = useState(false)
  const sdkContainer = containerEl || document.getElementById(containerId)

  const actions = (
    <Actions
      onAccept={nextStep}
      onDecline={() => {
        setModalToOpen(true)
      }}
    />
  )

  const triggerUserExit = () => {
    setModalToOpen(false)
    events.emit('userExit', 'USER_CONSENT_DENIED')
    unmountComponentAtNode(sdkContainer)
  }

  useEffect(() => {
    new Promise<string>((resolve, reject) => {
      getConsentFile(resolve, reject)
    })
      .then((html) => setConsentHtml(html))
      .catch((err) => console.error(err))
  }, [])

  return (
    <Fragment>
      {isModalOpen && (
        <DeclineModal
          isOpen={true}
          onRequestClose={() => setModalToOpen(false)}
          onDismissModal={() => setModalToOpen(false)}
          onAbandonFlow={triggerUserExit}
          containerEl={sdkContainer}
        />
      )}
      <ScreenLayout actions={actions}>
        <div
          className={style.consentFrame}
          data-onfido-qa="userConsentFrameWrapper"
          dangerouslySetInnerHTML={{
            __html: sanitize(consentHtml, { ADD_ATTR: ['target', 'rel'] }),
          }}
        />
      </ScreenLayout>
    </Fragment>
  )
}
export default trackComponent(UserConsent)
