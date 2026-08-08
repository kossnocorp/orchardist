# Keep this file synchronized (without the comment) with the Bash snippet in README.md.

__orchardist_parse_discriminators() {
  __orchardist_paths=()
  __orchardist_names=()
  __orchardist_symbols=()
  __orchardist_parsed_discriminators=${ORCHARDIST_DISCRIMINATORS-}
  [ -n "$__orchardist_parsed_discriminators" ] || return 1

  local path name symbol rest=$__orchardist_parsed_discriminators
  while [ -n "$rest" ]; do
    path=${rest%%;*}; rest=${rest#*;}
    name=${rest%%;*}; rest=${rest#*;}
    symbol=${rest%%;*}; rest=${rest#*;}
    if [ -n "$path" ] && [ -n "$symbol" ]; then
      __orchardist_paths+=("$path")
      __orchardist_names+=("$name")
      __orchardist_symbols+=("$symbol")
    fi
  done
}

__orchardist_on_pwd() {
  [ -n "${ORCHARDIST_DISCRIMINATORS-}" ] || return
  if [ "${__orchardist_parsed_discriminators-}" != "$ORCHARDIST_DISCRIMINATORS" ]; then
    __orchardist_parse_discriminators || return
  fi

  local best=-1 best_length=0 index path
  for index in "${!__orchardist_paths[@]}"; do
    path=${__orchardist_paths[$index]}
    if { [ "$PWD" = "$path" ] || [[ "$PWD" == "$path/"* ]]; } &&
      [ "${#path}" -gt "$best_length" ]; then
      best=$index
      best_length=${#path}
    fi
  done

  if [ "$best" -ge 0 ]; then
    export ORCHARDIST_WORKTREE_NAME=${__orchardist_names[$best]}
    export ORCHARDIST_WORKTREE_SYMBOL=${__orchardist_symbols[$best]}
  else
    unset ORCHARDIST_WORKTREE_NAME ORCHARDIST_WORKTREE_SYMBOL
  fi
}

case ";${PROMPT_COMMAND-};" in
  *";__orchardist_on_pwd;"*) ;;
  *) PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND;}__orchardist_on_pwd" ;;
esac
__orchardist_on_pwd
