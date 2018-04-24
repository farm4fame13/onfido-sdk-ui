import { h } from 'preact'
import style from './style.css'
import classNames from 'classnames'
import {preventDefaultOnClick} from '../utils'

const NavigationBar = ({back, i18n, disabled}) =>
  <div className={style.navigation}>
    <button href='#' className={classNames(style.back, {[style.disabled]: disabled})}
      onClick={preventDefaultOnClick(back)}>
        <span className={style.iconBack} />
        {i18n.t('back')}
    </button>
 </div>

export default NavigationBar
